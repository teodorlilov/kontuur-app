import type { PostValidationResult } from './validate-post'
import type {
  SourceGroundingResult,
  SourceGroundingIssue,
  LanguageIssue,
} from '@/ai/validation/types'
import {
  computeGroundingScore,
  computeLanguageScore,
} from '@/ai/validation/content-rules/compute-scores'
import type { SlideText } from '@/types/slide'

/**
 * Best-effort patch when the judge reported issues but returned no rewrite.
 * Each issue carries the exact offending phrase and its fix, so a plain string
 * replacement recovers them; a phrase the judge misquoted simply doesn't match
 * and the text is left alone. Fixes are counted as found, not guaranteed —
 * which is why the language score keeps reporting the issues (unlike a full
 * rewrite, which scores as clean).
 */
function applyIssueFixes(text: string, issues: LanguageIssue[]): string {
  let result = text
  for (const issue of issues) {
    if (!issue.original_text || !issue.suggested_fix) continue
    if (issue.original_text === issue.suggested_fix) continue
    result = result.split(issue.original_text).join(issue.suggested_fix)
  }
  return result
}

/**
 * Apply the corrected text from validation.
 *
 * One judge produces one corrected version carrying both factual and language
 * fixes, so there is no precedence to decide. This used to apply grounding first
 * and then let language overwrite it — over text the language judge had never
 * seen, which silently reinstated fabricated claims the grounding pass removed.
 * Both corrections now come from the same response and cannot disagree.
 *
 * When the merged judge finds issues without producing a rewrite — its most
 * common failure since one call took over eleven jobs — the per-issue fixes are
 * applied instead of shipping the flawed text untouched.
 */
function applyTextCorrections(original: string, validation: PostValidationResult): string {
  if (validation.language.corrected_text) return validation.language.corrected_text
  return applyIssueFixes(original, validation.language.issues)
}

/**
 * Apply slide-level corrections from language validation.
 * Merges corrected headline/body into existing slides, preserving
 * other slide fields (slide_number, slide_role, etc.).
 * Falls back to per-issue fixes like `applyTextCorrections` — language issues
 * are reported per phrase, not per slide, so each fix lands wherever its
 * offending phrase actually is.
 */
export function applySlideCorrections<T extends SlideText>(
  slides: T[],
  correctedSlides: SlideText[] | null | undefined,
  issues: LanguageIssue[] = []
): T[] {
  // Shape-checked, not just truthy. Two different judges feed this, each declaring
  // the field a different way, and neither schema is enforced — a `corrected_slides`
  // that arrived as a JSON string indexes into CHARACTERS here, and every slide
  // would ship with `headline: undefined`. An unusable payload leaves the copy alone.
  if (Array.isArray(correctedSlides)) {
    return slides.map((existing, i) => {
      const fix = correctedSlides[i]
      return fix && typeof fix.headline === 'string' && typeof fix.body === 'string'
        ? { ...existing, headline: fix.headline, body: fix.body }
        : existing
    })
  }
  if (issues.length === 0) return slides
  return slides.map((existing) => ({
    ...existing,
    headline: applyIssueFixes(existing.headline, issues),
    body: applyIssueFixes(existing.body, issues),
  }))
}

interface PostCorrectionsResult<T> {
  caption: string
  slides: T[] | null
  /** The same validation, its language verdict re-scored against the SHIPPED text. */
  validation: PostValidationResult
}

/**
 * The one exit from validation into saved copy: apply every available
 * correction, then make the language verdict describe what actually shipped.
 *
 * The rewrite path was already coherent — a full corrected_text ships clean and
 * scores clean. The per-issue fallback was not: fixes were applied to the copy
 * while the verdict kept scoring the pre-fix text, so review showed
 * "13 language fixes applied" beside a language score of 1. Each issue is now
 * stamped `applied` when its quoted phrase was verifiably present (and thus
 * replaced); only the unappliable remainder — judge misquotes the replacement
 * could never find — still counts against the score.
 */
export function applyPostCorrections<T extends SlideText>(
  caption: string,
  slides: T[] | null,
  validation: PostValidationResult
): PostCorrectionsResult<T> {
  const lang = validation.language
  const correctedCaption = applyTextCorrections(caption, validation)
  const correctedSlides = slides
    ? applySlideCorrections(slides, lang.corrected_slides, lang.issues)
    : null
  if (lang.issues.length === 0) {
    return { caption: correctedCaption, slides: correctedSlides, validation }
  }

  // A full rewrite corrects everything it covers, misquotes included; the
  // per-phrase check decides fates only where a piece relied on the fallback.
  const fullRewrite = !!lang.corrected_text && (!slides || !!lang.corrected_slides)
  const phraseFound = (issue: LanguageIssue): boolean =>
    !!issue.original_text &&
    !!issue.suggested_fix &&
    issue.original_text !== issue.suggested_fix &&
    (caption.includes(issue.original_text) ||
      (slides ?? []).some(
        (s) => s.headline.includes(issue.original_text) || s.body.includes(issue.original_text)
      ))
  const issues = lang.issues.map((issue) => ({
    ...issue,
    applied: fullRewrite || phraseFound(issue),
  }))
  const unresolved = issues.filter((issue) => !issue.applied)
  const rescored = computeLanguageScore({ issues: unresolved })
  return {
    caption: correctedCaption,
    slides: correctedSlides,
    validation: {
      ...validation,
      language: { ...lang, ...rescored, issues },
      scores: { ...validation.scores, language_score: rescored.language_score },
    },
  }
}

/**
 * Derives the SourceGroundingResult from source claims — the grounding verdict only.
 *
 * It used to carry its own `corrected_text`/`corrected_slides` as well, from a time
 * when grounding and language were separate judges with competing corrections.
 * Neither field was ever read: `applySlideCorrections` took the language copy and
 * `buildStoredValidation` persisted only the verdict. One judge now produces one
 * correction, so there is nothing left to duplicate.
 */
export function deriveSourceGroundingResult(
  claims: SourceGroundingIssue[]
): SourceGroundingResult {
  const { grounding_score, grounded } = computeGroundingScore({ flagged_claims: claims })
  return { grounded, grounding_score, flagged_claims: claims }
}

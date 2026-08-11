import type { PostValidationResult } from './validate-post'
import type { SourceGroundingResult, SourceGroundingIssue } from '@/ai/validation/types'
import { computeGroundingScore } from '@/ai/validation/content-rules/compute-scores'

/**
 * Apply the corrected text from validation.
 *
 * One judge produces one corrected version carrying both factual and language
 * fixes, so there is no precedence to decide. This used to apply grounding first
 * and then let language overwrite it — over text the language judge had never
 * seen, which silently reinstated fabricated claims the grounding pass removed.
 * Both corrections now come from the same response and cannot disagree.
 */
export function applyTextCorrections(original: string, validation: PostValidationResult): string {
  return validation.language.corrected_text ?? original
}

/**
 * Apply slide-level corrections from language validation.
 * Merges corrected headline/body into existing slides, preserving
 * other slide fields (slide_number, slide_role, etc.).
 */
export function applySlideCorrections<T extends { headline: string; body: string }>(
  slides: T[],
  correctedSlides: Array<{ headline: string; body: string }> | null | undefined
): T[] {
  if (!correctedSlides) return slides
  return slides.map((existing, i) => {
    const fix = correctedSlides[i]
    return fix ? { ...existing, headline: fix.headline, body: fix.body } : existing
  })
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

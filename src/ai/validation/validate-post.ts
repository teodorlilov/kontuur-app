import {
  validateQuality,
  validateQualityBatch,
  type LlmQualityResponse,
} from '@/ai/validation/prompts/prompt-builder'
import {
  computeSourceScore,
  computeLanguageScore,
  deriveSlopFromQuality,
} from '@/ai/validation/content-rules/compute-scores'
import {
  checkCarouselStructure,
  checkSingleFormat,
} from '@/ai/validation/content-rules/check-structure'
import {
  validateLanguageFocus,
  mergeLanguageVerdicts,
  type LanguageFocusResult,
} from '@/ai/validation/prompts/language-focus'
import { deriveSourceGroundingResult } from '@/ai/validation/correction-utils'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import type {
  ValidationCriteria,
  ValidationScores,
  PostValidationResult,
  LanguageValidationResult,
} from '@/ai/validation/types'
import type { SlideText } from '@/types/slide'

export interface SourceContext {
  excerpt: string
  url?: string | null
}

interface ValidatePostInput {
  caption: string
  slides?: SlideText[]
  client: ClientData
  platform: string
  sourceContext?: SourceContext
  theme?: string
  targetPillar?: string
  label: string
}

interface ValidatePostsBatchInput {
  captions: string[]
  client: ClientData
  platform: string
  sourceContext?: SourceContext
  theme?: string
  targetPillar?: string
  label: string
}

// Re-export for consumers that import PostValidationResult from here
export type { PostValidationResult }

const LANGUAGE_FALLBACK: LanguageValidationResult = {
  passes: true,
  language_score: 10,
  issues: [],
  corrected_text: null,
}

/**
 * Code structure check for a single post — non-null only on failure, so passing
 * singles keep `structure_followed: null` (the stored shape the review UI reads
 * as "not a carousel") and only a caption masquerading as a carousel surfaces.
 */
function singleFormatFailure(caption: string): { passes: boolean; notes: string[] } | null {
  const result = checkSingleFormat(caption)
  return result.passes ? null : result
}

// Haiku sometimes returns the full checklist with PASS/FAIL prefixes despite
// being asked for failures only — keep only genuine failure notes
function toFailureNotes(notes: string[]): string[] {
  return notes
    .filter((note) => !/^\s*PASS\b/i.test(note))
    .map((note) => note.replace(/^\s*(FAIL|CAUTION)\s*[:—-]\s*/i, ''))
}

/** Assemble the final result from the raw LLM responses — pure, no LLM calls. */
function assemblePostValidation(
  qualityRaw: LlmQualityResponse | null,
  hasSource: boolean,
  codeStructure: { passes: boolean; notes: string[] } | null = null,
  languageFocus: LanguageFocusResult | null = null
): PostValidationResult {
  // The merged judge's language verdict, overlaid by the focused proofreader
  // when one ran (non-English clients): the eleven-job judge demonstrably
  // misses anglicisms it scores 10/10, and everything downstream — corrections,
  // the refine loop — keys off these issues existing.
  const verdict = qualityRaw
    ? mergeLanguageVerdicts(
        {
          issues: qualityRaw.language_issues ?? [],
          corrected_text: qualityRaw.corrected_text,
          corrected_slides: qualityRaw.corrected_slides,
        },
        languageFocus
      )
    : languageFocus
      ? mergeLanguageVerdicts(
          { issues: [], corrected_text: null, corrected_slides: null },
          languageFocus
        )
      : null
  const lang: LanguageValidationResult = verdict
    ? {
        ...computeLanguageScore({ issues: verdict.issues }),
        issues: verdict.issues,
        corrected_text: verdict.corrected_text,
        ...(verdict.corrected_slides !== null
          ? { corrected_slides: verdict.corrected_slides }
          : {}),
      }
    : LANGUAGE_FALLBACK
  // Structure verdict merges code-counted checks (word counts, cover body —
  // deterministic) with the LLM's semantic notes (distinct ideas, headlines)
  const llmStructure =
    qualityRaw && qualityRaw.structure_passes !== null
      ? {
          passes: qualityRaw.structure_passes,
          notes: toFailureNotes(qualityRaw.structure_notes),
        }
      : null
  const structureFollowed =
    codeStructure || llmStructure
      ? {
          passes: (codeStructure?.passes ?? true) && (llmStructure?.passes ?? true),
          notes: [...(codeStructure?.notes ?? []), ...(llmStructure?.notes ?? [])],
        }
      : null

  const criteria: ValidationCriteria = qualityRaw
    ? {
        ai_tells: qualityRaw.ai_tells,
        worst_offending_phrase: qualityRaw.worst_offending_phrase,
        structure_followed: structureFollowed,
        source_claims: hasSource ? qualityRaw.flagged_claims : null,
        health_compliant: qualityRaw.health_compliant,
        issues: qualityRaw.issues,
      }
    : {
        ai_tells: [],
        worst_offending_phrase: null,
        structure_followed: structureFollowed,
        source_claims: null,
        health_compliant: null,
        issues: [],
      }

  // Auto-corrected language counts as clean — the corrected text is what ships
  const langCorrected = !!(lang.corrected_text || lang.corrected_slides)
  const language: LanguageValidationResult = langCorrected
    ? { ...lang, language_score: 10, passes: true }
    : lang

  const scores: ValidationScores = {
    overall_score: qualityRaw?.overall_score ?? null,
    human_score: qualityRaw?.human_score ?? null,
    language_score: language.language_score,
    source_score: computeSourceScore(criteria.source_claims),
  }

  const slop = deriveSlopFromQuality({
    human_score: scores.human_score,
    ai_tells: criteria.ai_tells,
    worst_offending_phrase: criteria.worst_offending_phrase,
  })

  const sourceGrounding =
    hasSource && qualityRaw && criteria.source_claims !== null
      ? deriveSourceGroundingResult(criteria.source_claims)
      : undefined

  return {
    criteria,
    scores,
    language,
    slop,
    ...(sourceGrounding ? { sourceGrounding } : {}),
    qualityScore: scores.overall_score,
  }
}

/** The focused proofreader runs only where the leak exists — crossing FROM English. */
function needsLanguageFocus(client: ClientData): boolean {
  return client.languageConfig.language.trim().toLowerCase() !== 'english'
}

/**
 * The text the proofreader should read: the grader's corrected version when it
 * produced one, else the original.
 *
 * This is what makes the two calls sequential rather than parallel. The grader is
 * the only call that sees the source material, so its corrected text carries
 * factual fixes the proofreader cannot reproduce. Running them side by side
 * produced two competing rewrites and the merge kept the proofreader's, silently
 * dropping every fact the grader had repaired. Chaining them makes the
 * proofreader's output a superset — language fixes applied on top of corrected
 * facts — so `mergeLanguageVerdicts` preferring it is now correct.
 */
function textForProofreader(
  input: { caption: string; slides?: SlideText[] },
  qualityRaw: LlmQualityResponse | null,
  isCarousel: boolean
): { caption: string; slides?: SlideText[] } {
  const caption = qualityRaw?.corrected_text ?? input.caption
  if (!isCarousel) return { caption }
  return { caption, slides: qualityRaw?.corrected_slides ?? input.slides }
}

/**
 * Unified validation for both single posts and carousels: the grader (quality,
 * source grounding, language) first, then — for non-English clients only — a
 * focused native proofreader over the grader's corrected text.
 *
 * The two calls are sequential by design; see textForProofreader. Cost is one
 * extra round trip per post on non-English clients.
 */
export async function validatePost(input: ValidatePostInput): Promise<PostValidationResult> {
  const isCarousel = !!input.slides && input.slides.length > 0

  const qualityRaw = await validateQuality({
    caption: input.caption,
    slides: input.slides,
    client: input.client,
    platform: input.platform,
    theme: input.theme,
    targetPillar: input.targetPillar,
    sourceContext: input.sourceContext,
  }).catch((err) => {
    console.error(`[${input.label}] validation failed:`, err)
    return null
  })

  const focus = needsLanguageFocus(input.client)
    ? await validateLanguageFocus(
        textForProofreader(input, qualityRaw, isCarousel),
        input.client.languageConfig
      ).catch((err) => {
        console.error(`[${input.label}] language focus failed:`, err)
        return null
      })
    : null

  const codeStructure = isCarousel
    ? checkCarouselStructure(input.caption, input.slides!)
    : singleFormatFailure(input.caption)

  return assemblePostValidation(qualityRaw, !!input.sourceContext, codeStructure, focus)
}

/**
 * Validate N single-post variants of one theme in ONE grader call.
 * A failed call degrades ALL items in this theme to the same fallbacks the
 * per-post path uses — accepted trade-off for the N → 1 request reduction.
 *
 * The proofreader pass then runs per caption over the grader's corrections, for
 * the reason in textForProofreader. Those N calls stay parallel with each other,
 * so the batch costs two sequential steps rather than N + 1.
 */
export async function validatePostsBatch(
  input: ValidatePostsBatchInput
): Promise<PostValidationResult[]> {
  const results = await validateQualityBatch({
    captions: input.captions,
    client: input.client,
    platform: input.platform,
    theme: input.theme,
    targetPillar: input.targetPillar,
    sourceContext: input.sourceContext,
  }).catch((err) => {
    console.error(`[${input.label}] validation batch failed:`, err)
    return input.captions.map(() => null)
  })

  const focusResults = needsLanguageFocus(input.client)
    ? await Promise.all(
        input.captions.map((caption, i) =>
          validateLanguageFocus(
            textForProofreader({ caption }, results[i] ?? null, false),
            input.client.languageConfig
          ).catch((err) => {
            console.error(`[${input.label}] language focus failed:`, err)
            return null
          })
        )
      )
    : input.captions.map(() => null)

  return input.captions.map((caption, i) =>
    assemblePostValidation(
      results[i] ?? null,
      !!input.sourceContext,
      singleFormatFailure(caption),
      focusResults[i] ?? null
    )
  )
}

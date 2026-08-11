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
import { checkCarouselStructure } from '@/ai/validation/content-rules/check-structure'
import { deriveSourceGroundingResult } from '@/ai/validation/correction-utils'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import type {
  ValidationCriteria,
  ValidationScores,
  PostValidationResult,
  LanguageValidationResult,
} from '@/ai/validation/types'

export interface SourceContext {
  excerpt: string
  url?: string | null
}

export interface ValidatePostInput {
  caption: string
  slides?: Array<{ headline: string; body: string }>
  client: ClientData
  platform: string
  sourceContext?: SourceContext
  theme?: string
  targetPillar?: string
  label: string
}

export interface ValidatePostsBatchInput {
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

// Haiku sometimes returns the full checklist with PASS/FAIL prefixes despite
// being asked for failures only — keep only genuine failure notes
function toFailureNotes(notes: string[]): string[] {
  return notes
    .filter((note) => !/^\s*PASS\b/i.test(note))
    .map((note) => note.replace(/^\s*(FAIL|CAUTION)\s*[:—-]\s*/i, ''))
}

/** Assemble the final result from one raw LLM response — pure, no LLM calls. */
function assemblePostValidation(
  qualityRaw: LlmQualityResponse | null,
  hasSource: boolean,
  codeStructure: { passes: boolean; notes: string[] } | null = null
): PostValidationResult {
  // One judge, one corrected text. This used to be two parallel calls whose
  // corrections both landed on the same caption, with language applied last — so a
  // language rewrite silently reinstated a fabricated statistic the grounding pass
  // had just removed, over text the language judge had never seen.
  const languageIssues = qualityRaw?.language_issues ?? []
  const lang: LanguageValidationResult = qualityRaw
    ? {
        ...computeLanguageScore({ issues: languageIssues }),
        issues: languageIssues,
        corrected_text: qualityRaw.corrected_text,
        ...(qualityRaw.corrected_slides !== undefined
          ? { corrected_slides: qualityRaw.corrected_slides }
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

/**
 * Unified validation for both single posts and carousels — one LLM call covering
 * quality, source grounding and language.
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

  const codeStructure = isCarousel ? checkCarouselStructure(input.caption, input.slides!) : null

  return assemblePostValidation(qualityRaw, !!input.sourceContext, codeStructure)
}

/**
 * Validate N single-post variants of one theme in ONE LLM call.
 * A failed call degrades ALL items in this theme to the same fallbacks the
 * per-post path uses — accepted trade-off for the N → 1 request reduction.
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

  return input.captions.map((_, i) =>
    assemblePostValidation(results[i] ?? null, !!input.sourceContext)
  )
}

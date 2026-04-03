import { validateQuality } from '@/ai/validation/prompts/validate-quality'
import { validateLanguage } from '@/ai/validation/prompts/validate-language'
import { validateSourceGrounding } from '@/ai/validation/prompts/validate-source-grounding'
import { deriveSlopFromQuality, computeCriteriaScore } from '@/ai/validation/content-rules/compute-scores'
import type { CriteriaDetections } from '@/ai/validation/content-rules/compute-scores'
import { DEFAULT_QUALITY_SCORE } from '@/lib/content-rules/constants'
import { analyzeSentenceVariety, countWords, countHashtags } from '@/ai/validation/content-rules/text-analysis'
import type { QualityResult, QualityContext } from '@/ai/validation/prompts/validate-quality'
import type { LanguageValidationResult } from '@/ai/validation/prompts/validate-language'
import type { SourceGroundingResult } from '@/ai/validation/prompts/validate-source-grounding'
import type { SlopDetection } from '@/types/api'
import type { LanguageConfig } from '@/lib/clients/language-rules'

export interface SourceContext {
  excerpt: string
  url?: string | null
}

export interface ValidatePostInput {
  caption: string
  slides?: Array<{ headline: string; body: string }>
  languageConfig: LanguageConfig
  label: string
  platform?: string
  sourceContext?: SourceContext
  qualityContext?: QualityContext
}

export interface PostValidationResult {
  quality: QualityResult
  language: LanguageValidationResult
  slop: SlopDetection
  sourceGrounding?: SourceGroundingResult
  qualityScore: number
  /** Names of validation steps that failed and fell back to defaults */
  validationWarnings: string[]
}

/** Safe default quality fallback. Adapts to single or carousel. */
function defaultQualityFallback(isCarousel: boolean): QualityResult {
  const base = {
    human_score: DEFAULT_QUALITY_SCORE,
    hook_score: DEFAULT_QUALITY_SCORE,
    cta_score: DEFAULT_QUALITY_SCORE,
    criteria_score: DEFAULT_QUALITY_SCORE,
    quality_score_avg: DEFAULT_QUALITY_SCORE,
    hook_verdict: 'clear_value' as const,
    cta_verdict: 'clear_relevant' as const,
    brand_voice_match: true,
    brand_voice_deviation: null,
    audience_targeting: true,
    audience_gap: null,
    niche_specificity: true,
    niche_gap: null,
    ai_tells: [] as string[],
    worst_offending_phrase: null,
    issues: [] as Array<{ type: string; description: string }>,
    opener_follows_rules: true,
    opener_violation: null,
    structure_is_predictable: false,
    structure_used: null,
    formality_consistent: true,
    formality_violation: null,
    source_fidelity_ok: null,
    health_compliant: null,
  }
  return isCarousel ? { ...base, kind: 'carousel' } : { ...base, kind: 'single' }
}

/**
 * Unified validation for both single posts and carousels.
 * Runs LLM validations in parallel with deterministic text analysis,
 * then combines results to compute criteria_score.
 */
export async function validatePost(input: ValidatePostInput): Promise<PostValidationResult> {
  const validationWarnings: string[] = []
  const isCarousel = !!input.slides && input.slides.length > 0

  const ctx: QualityContext = {
    platform: input.platform,
    languageConfig: input.languageConfig,
    ...input.qualityContext,
  }

  // Run LLM validations in parallel
  const [quality, lang, grounding] = await Promise.all([
    validateQuality(
      { caption: input.caption, slides: input.slides },
      ctx,
    ).catch((err) => {
      console.error(`[generate] ${input.label} quality validation failed:`, err)
      validationWarnings.push('quality')
      return defaultQualityFallback(isCarousel)
    }),
    validateLanguage(
      isCarousel ? { text: input.caption, slides: input.slides } : { text: input.caption },
      input.languageConfig,
    ).catch((err) => {
      console.error(`[generate] ${input.label} language validation failed:`, err)
      validationWarnings.push('language')
      return { passes: true, language_score: 10, issues: [], corrected_text: null }
    }),
    input.sourceContext
      ? validateSourceGrounding(input.caption, input.sourceContext.excerpt).catch((err) => {
          console.error(`[generate] ${input.label} source grounding validation failed:`, err)
          validationWarnings.push('source_grounding')
          return null
        })
      : Promise.resolve(null),
  ])

  // Deterministic text analysis (zero cost, runs immediately)
  const sentenceVariety = analyzeSentenceVariety(input.caption)
  const wordCount = countWords(input.caption)
  const hashtagCount = countHashtags(input.caption)

  // Compute criteria score from LLM detections + deterministic analysis
  const criteriaDetections: CriteriaDetections = {
    opener_follows_rules: quality.opener_follows_rules,
    structure_is_predictable: quality.structure_is_predictable,
    formality_consistent: quality.formality_consistent,
    source_fidelity_ok: quality.source_fidelity_ok,
    health_compliant: quality.health_compliant,
    sentenceVariety,
    wordCount,
    platform: input.platform ?? '',
    hashtagCount,
  }
  const criteriaScore = computeCriteriaScore(criteriaDetections)

  // Derive slop-compatible shape from quality result (no separate LLM call)
  const slop = deriveSlopFromQuality(quality)

  // Recalculate quality_score_avg with the deterministic criteria_score
  // (the original avg used criteria_score=10 default from computeQualityScores)
  const recalculatedAvg = Math.round(
    (quality.human_score + quality.hook_score + quality.cta_score + criteriaScore) / 4
  )

  return {
    quality: { ...quality, criteria_score: criteriaScore, quality_score_avg: recalculatedAvg },
    language: lang,
    slop,
    ...(grounding ? { sourceGrounding: grounding } : {}),
    qualityScore: recalculatedAvg,
    validationWarnings,
  }
}

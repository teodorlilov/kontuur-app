import { validateQuality } from '@/ai/validation/prompts/prompt-builder'
import { validateLanguage } from '@/ai/validation/prompts/validate-language'
import {
  computeBriefScore,
  computeCraftScore,
  computeVoiceScore,
  computeSourceScore,
  computeOverallScore,
  computeLanguageSubScores,
  computeQualityScores,
  safeParseHookVerdict,
  safeParseCtaVerdict,
  deriveSlopFromQuality,
} from '@/ai/validation/content-rules/compute-scores'
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
  declaredStructure?: string
  label: string
}

// Re-export for consumers that import PostValidationResult from here
export type { PostValidationResult }

/**
 * Unified validation for both single posts and carousels.
 * Runs quality (+ source grounding) and language validation in parallel (2 LLM calls).
 */
export async function validatePost(input: ValidatePostInput): Promise<PostValidationResult> {
  const validationWarnings: string[] = []
  const isCarousel = !!input.slides && input.slides.length > 0

  const [qualityRaw, lang] = await Promise.all([
    validateQuality({ 
      caption: input.caption,
      slides: input.slides,
      client: input.client,
      platform: input.platform,
      theme: input.theme,
      targetPillar: input.targetPillar,
      declaredStructure: input.declaredStructure,
      sourceContext: input.sourceContext,
    }).catch((err) => {
      console.error(`[${input.label ?? 'validate'}] quality validation failed:`, err)
      validationWarnings.push('quality')
      return null
    }),
    validateLanguage(
      isCarousel ? { text: input.caption, slides: input.slides } : { text: input.caption },
      input.client.languageConfig
    ).catch((err) => {
      console.error(`[${input.label ?? 'validate'}] language validation failed:`, err)
      validationWarnings.push('language')
      return {
        passes: true,
        language_score: 10,
        issues: [],
        corrected_text: null,
      } as LanguageValidationResult
    }),
  ])

  // Build ValidationCriteria from raw LLM output
  let criteria: ValidationCriteria
  if (qualityRaw === null) {
    // Quality call failed — use defaults
    criteria = {
      niche_fit: { passes: true, gap: null },
      audience_match: { passes: true, gap: null },
      pillar_match: null,
      theme_adherence: { passes: true, gap: null },
      hook: { verdict: 'clear_value', note: null },
      cta: { verdict: 'clear_relevant', note: null },
      structure_followed: null,
      ai_tells: [],
      worst_offending_phrase: null,
      brand_voice: { passes: true, gap: null },
      formality: { passes: true, gap: null },
      source_claims: null,
      health_compliant: null,
      issues: [],
    }
  } else {
    criteria = {
      niche_fit: { passes: qualityRaw.niche_fit, gap: qualityRaw.niche_gap },
      audience_match: { passes: qualityRaw.audience_match, gap: qualityRaw.audience_gap },
      pillar_match: input.targetPillar
        ? { passes: qualityRaw.pillar_match ?? true, gap: qualityRaw.pillar_gap }
        : null,
      theme_adherence: { passes: qualityRaw.theme_adherence, gap: qualityRaw.theme_gap },
      hook: {
        verdict: safeParseHookVerdict(qualityRaw.hook_verdict),
        note: qualityRaw.hook_note,
      },
      cta: {
        verdict: safeParseCtaVerdict(qualityRaw.cta_verdict),
        note: qualityRaw.cta_note,
      },
      structure_followed: qualityRaw.structure_checks
        ? {
            checks: qualityRaw.structure_checks,
            passes: qualityRaw.structure_checks.every((c) => c.passes),
          }
        : null,
      ai_tells: qualityRaw.ai_tells,
      worst_offending_phrase: qualityRaw.worst_offending_phrase,
      brand_voice: { passes: qualityRaw.brand_voice_match, gap: qualityRaw.brand_voice_deviation },
      formality: { passes: qualityRaw.formality_consistent, gap: qualityRaw.formality_violation },
      source_claims: input.sourceContext ? qualityRaw.flagged_claims : null,
      health_compliant: qualityRaw.health_compliant,
      issues: qualityRaw.issues,
    }
  }

  // Compute new score dimensions
  // If language was auto-corrected, treat sub-scores as 10 so scores stay consistent.
  const langSubScores = computeLanguageSubScores(lang.issues)
  const langCorrected = !!(lang.corrected_text || lang.corrected_slides)
  const effectiveLangScores = langCorrected
    ? { naturalness_score: 10, register_score: 10, language_score: 10 }
    : langSubScores
  const humanScore = computeQualityScores({
    ai_tells: criteria.ai_tells,
    issues: criteria.issues,
    hook_verdict: criteria.hook.verdict,
    cta_verdict: criteria.cta.verdict,
    brand_voice_match: criteria.brand_voice.passes,
    audience_targeting: criteria.audience_match.passes,
    niche_specificity: criteria.niche_fit.passes,
  }).human_score

  const scores: ValidationScores = {
    brief_score: computeBriefScore(criteria, !!input.targetPillar),
    craft_score: computeCraftScore(criteria),
    voice_score: computeVoiceScore(criteria),
    source_score: computeSourceScore(criteria.source_claims),
    language_score: effectiveLangScores.language_score,
    language_naturalness_score: effectiveLangScores.naturalness_score,
    language_register_score: effectiveLangScores.register_score,
    human_score: humanScore,
    overall_score: 0, // filled below
  }
  scores.overall_score = computeOverallScore(scores)

  const slop = deriveSlopFromQuality({
    human_score: humanScore,
    ai_tells: criteria.ai_tells,
    worst_offending_phrase: criteria.worst_offending_phrase,
  })

  // Derive SourceGroundingResult when source was provided
  const sourceGrounding =
    input.sourceContext && qualityRaw && criteria.source_claims !== null
      ? deriveSourceGroundingResult(
          criteria.source_claims,
          qualityRaw.corrected_text,
          qualityRaw.corrected_slides
        )
      : undefined 

  // Attach language sub-scores; use effective scores so correction is reflected everywhere.
  const languageWithSubScores: LanguageValidationResult = {
    ...lang,
    language_score: effectiveLangScores.language_score,
    passes: langCorrected ? true : lang.passes,
    language_naturalness_score: effectiveLangScores.naturalness_score,
    language_register_score: effectiveLangScores.register_score,
  }


  return {
    criteria,
    scores,
    language: languageWithSubScores,
    slop,
    ...(sourceGrounding ? { sourceGrounding } : {}),
    qualityScore: scores.overall_score,
    validationWarnings,
  }
}

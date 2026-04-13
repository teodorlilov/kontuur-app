import type { PostValidationResult } from './validate-post'
import type {
  ValidationCriteria,
  QualityResult,
  QualityScores,
  SourceGroundingResult,
  SourceGroundingIssue,
} from '@/ai/validation/types'
import {
  computeQualityScores,
  computeCriteriaScore,
  computeGroundingScore,
  safeParseHookVerdict,
  safeParseCtaVerdict,
  deriveSlopFromQuality,
} from '@/ai/validation/content-rules/compute-scores'
import type { CriteriaDetections, QualityDetections } from '@/ai/validation/content-rules/compute-scores'

export { safeParseHookVerdict, safeParseCtaVerdict, deriveSlopFromQuality }

/**
 * Apply text corrections from validation results.
 * Priority: language corrections win over source grounding corrections.
 * Grounding is applied first (fixes factual errors), then language overwrites
 * (ensures the corrected text is grammatically native).
 */
export function applyTextCorrections(original: string, validation: PostValidationResult): string {
  let result = original
  if (validation.sourceGrounding?.corrected_text) {
    result = validation.sourceGrounding.corrected_text
  }
  if (validation.language.corrected_text) {
    result = validation.language.corrected_text
  }
  return result
}

/**
 * Apply slide-level corrections from language validation.
 * Merges corrected headline/body into existing slides, preserving
 * other slide fields (slide_number, slide_role, design_note, etc.).
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
 * Derives the backward-compatible QualityResult from the new ValidationCriteria.
 * Used to populate the `quality` field of PostValidationResult for DB and UI compat.
 */
export function deriveQualityResult(
  criteria: ValidationCriteria,
  opts: { declaredStructure?: string; isCarousel: boolean }
): QualityResult {
  // Derive structure_is_predictable: true when structure checks were run but failed
  const structure_is_predictable =
    criteria.structure_followed !== null && !criteria.structure_followed.passes

  // Derive source_fidelity_ok from source_claims
  const source_fidelity_ok =
    criteria.source_claims === null
      ? null
      : criteria.source_claims.length === 0 ||
        criteria.source_claims.every((c) => c.status === 'grounded')

  const criteriaDetections: CriteriaDetections = {
    structure_is_predictable,
    formality_consistent: criteria.formality.passes,
    source_fidelity_ok,
    health_compliant: criteria.health_compliant,
  }
  const criteria_score = computeCriteriaScore(criteriaDetections)

  const qualityDetections: QualityDetections = {
    ai_tells: criteria.ai_tells,
    issues: criteria.issues,
    hook_verdict: criteria.hook.verdict,
    cta_verdict: criteria.cta.verdict,
    brand_voice_match: criteria.brand_voice.passes,
    audience_targeting: criteria.audience_match.passes,
    niche_specificity: criteria.niche_fit.passes,
    structure_used: opts.declaredStructure ?? null,
  }
  const scores = computeQualityScores(qualityDetections, criteria_score)

  const result: QualityScores = {
    ...scores,
    hook_verdict: criteria.hook.verdict,
    cta_verdict: criteria.cta.verdict,
    brand_voice_match: criteria.brand_voice.passes,
    brand_voice_deviation: criteria.brand_voice.gap,
    audience_targeting: criteria.audience_match.passes,
    audience_gap: criteria.audience_match.gap,
    niche_specificity: criteria.niche_fit.passes,
    niche_gap: criteria.niche_fit.gap,
    ai_tells: criteria.ai_tells,
    worst_offending_phrase: criteria.worst_offending_phrase,
    issues: criteria.issues,
    structure_is_predictable,
    structure_used: opts.declaredStructure ?? null,
    formality_consistent: criteria.formality.passes,
    formality_violation: criteria.formality.gap,
    source_fidelity_ok,
    health_compliant: criteria.health_compliant,
  }

  return opts.isCarousel ? { ...result, kind: 'carousel' } : { ...result, kind: 'single' }
}

/**
 * Derives the backward-compatible SourceGroundingResult from source claims.
 * Used to populate the `sourceGrounding` field of PostValidationResult.
 */
export function deriveSourceGroundingResult(
  claims: SourceGroundingIssue[],
  correctedText: string | null,
  correctedSlides: Array<{ headline: string; body: string }> | null | undefined
): SourceGroundingResult {
  const { grounding_score, grounded } = computeGroundingScore({ flagged_claims: claims })
  return {
    grounded,
    grounding_score,
    flagged_claims: claims,
    corrected_text: correctedText ?? null,
    ...(correctedSlides !== undefined ? { corrected_slides: correctedSlides } : {}),
  }
}

import type { PostValidationResult } from './validate-post'
import type { SourceGroundingResult, SourceGroundingIssue } from '@/ai/validation/types'
import { computeGroundingScore } from '@/ai/validation/content-rules/compute-scores'

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

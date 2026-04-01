import type { PostValidationResult } from './validate-post'

/**
 * Apply text corrections from validation results.
 * Priority: language corrections win over source grounding corrections.
 * Grounding is applied first (fixes factual errors), then language overwrites
 * (ensures the corrected text is grammatically native).
 */
export function applyTextCorrections(
  original: string,
  validation: PostValidationResult,
): string {
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
  correctedSlides: Array<{ headline: string; body: string }> | null | undefined,
): T[] {
  if (!correctedSlides) return slides
  return slides.map((existing, i) => {
    const fix = correctedSlides[i]
    return fix ? { ...existing, headline: fix.headline, body: fix.body } : existing
  })
}

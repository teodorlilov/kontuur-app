import type { StructureResult } from '@/ai/validation/types'

// Rule targets are 40-60 caption words and ~30 body words; the tolerances
// avoid nagging on boundary counts the reader wouldn't notice
const CAPTION_MIN_WORDS = 35
const CAPTION_MAX_WORDS = 70
const SLIDE_BODY_MAX_WORDS = 35

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Deterministic carousel structure checks — word counts and cover-body rules
 * used to be delegated to the LLM, which miscounts and reported false
 * failures ("73 words" on a 55-word caption). Code counts; the LLM only
 * judges the semantic rules.
 */
export function checkCarouselStructure(
  caption: string,
  slides: Array<{ headline: string; body: string }>
): StructureResult {
  const notes: string[] = []

  const captionWords = countWords(caption)
  if (captionWords < CAPTION_MIN_WORDS || captionWords > CAPTION_MAX_WORDS) {
    notes.push(`Main caption is ${captionWords} words — target 40-60.`)
  }

  const cover = slides[0]
  if (cover && cover.body.trim().length > 0) {
    notes.push('Cover slide has body text — the cover is headline-only.')
  }

  slides.forEach((slide, i) => {
    if (i === 0) return
    const bodyWords = countWords(slide.body)
    if (bodyWords > SLIDE_BODY_MAX_WORDS) {
      notes.push(`Slide ${i + 1} body is ${bodyWords} words — keep bodies under ~30.`)
    }
  })

  return { passes: notes.length === 0, notes }
}

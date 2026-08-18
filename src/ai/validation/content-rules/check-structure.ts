import type { StructureResult } from '@/ai/validation/types'
import type { SlideText } from '@/types/slide'

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
export function checkCarouselStructure(caption: string, slides: SlideText[]): StructureResult {
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

// Slide labels in EN and BG (the languages the app generates in), plus the
// Headline:/Body: field convention the carousel writer uses. Two label lines are
// required so a caption that merely quotes "headline:" once is not flagged.
// \p{L} boundary rather than \b — \b is ASCII-only and never fires before Cyrillic.
const SLIDE_LABEL = /(?:^|[^\p{L}])(?:SLIDE|СЛАЙД)\s*\d/iu
const FIELD_LABEL = /^\s*\**\s*(headline|body|заглавие|текст)\s*\**\s*:/gim

/**
 * Deterministic guard for single posts: a caption structured as a carousel.
 *
 * The LLM judge cannot catch this — it is explicitly told to skip structure
 * checks for non-carousels — so a writer that emitted slide-by-slide text as a
 * single post's caption used to sail into the ready bucket unflagged.
 */
export function checkSingleFormat(caption: string): StructureResult {
  const fieldLabelCount = caption.match(FIELD_LABEL)?.length ?? 0
  if (SLIDE_LABEL.test(caption) || fieldLabelCount >= 2) {
    return {
      passes: false,
      notes: ['Caption is written as a carousel (slide labels) — this is a single-image post.'],
    }
  }
  return { passes: true, notes: [] }
}

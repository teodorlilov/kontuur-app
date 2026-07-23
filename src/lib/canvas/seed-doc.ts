import type {
  CanvasBackgroundRef,
  CanvasDoc,
  CanvasTextLayer,
  CanvasTextRole,
} from '@/types/canvas'
import type { Palette } from '@/types/visual'
import { getBrandStyle } from '@/lib/visual/brand-styles'
import { clampAtWordBoundary, sanitizePromptText } from '@/lib/visual/prompt'
import { CANVAS_DOC_VERSION, CANVAS_HEIGHT, CANVAS_WIDTH } from './constants'

/** Captions are generated hook-first, so sentence one is the designed hook; keep it slide-sized. */
const HOOK_MAX_CHARS = 90

// Seed geometry in the 1080×1350 authoring space; autofit shrinks oversized copy on first render.
const TEXT_X = 96
const TEXT_WIDTH = CANVAS_WIDTH - TEXT_X * 2
const HEADLINE_Y = 128
const HEADLINE_SIZE = 88
const BODY_Y = 760
const BODY_SIZE = 44

/** The caption's hook line: first sentence, sanitized of URLs/#tags/@mentions, word-boundary clamped. */
export function captionHook(caption: string | null | undefined): string {
  const sanitized = sanitizePromptText(caption ?? '')
  const firstLine = sanitized.split('\n').find((line) => line.trim().length > 0) ?? ''
  const sentence = firstLine.match(/^(.*?[.!?…])(?:\s|$)/)?.[1] ?? firstLine
  return clampAtWordBoundary(sentence.trim(), HOOK_MAX_CHARS)
}

/** Palette + brand style as surfaces hold them (style stays a free string; unknown → default). */
export interface SeedIdentity {
  palette: Palette
  style?: string
}

interface SeedInput {
  identity: SeedIdentity
  background: CanvasBackgroundRef
  /** Carousel copy for this position; omit for single posts. */
  slide?: { headline: string; body: string }
  /** Single-post caption; its hook becomes the one seeded headline. */
  caption?: string | null
}

/**
 * Build the first canvas doc for a slide: copy placed in the brand style's font pairing over the
 * clean background, contrast scrim on. Empty copy seeds no layer — callers can skip composing a
 * doc with zero layers.
 */
export function seedCanvasDoc(input: SeedInput): CanvasDoc {
  const { identity, background, slide, caption } = input
  const style = getBrandStyle(identity.style)
  const headlineText = slide ? sanitizePromptText(slide.headline) : captionHook(caption)
  const bodyText = slide ? sanitizePromptText(slide.body) : ''
  const layers: CanvasTextLayer[] = []

  if (headlineText) {
    layers.push({
      id: crypto.randomUUID(),
      role: 'headline',
      text: style.fonts.headlineUppercase ? headlineText.toUpperCase() : headlineText,
      x: TEXT_X,
      y: HEADLINE_Y,
      width: TEXT_WIDTH,
      fontFamily: style.fonts.display,
      fontSize: HEADLINE_SIZE,
      fontWeight: 700,
      fill: identity.palette.ink,
      align: 'left',
      lineHeight: 1.1,
    })
  }
  if (bodyText) {
    layers.push({
      id: crypto.randomUUID(),
      role: 'body',
      text: bodyText,
      x: TEXT_X,
      y: BODY_Y,
      width: TEXT_WIDTH,
      fontFamily: style.fonts.body,
      fontSize: BODY_SIZE,
      fontWeight: 400,
      fill: identity.palette.ink,
      align: 'left',
      lineHeight: 1.35,
    })
  }

  return {
    version: CANVAS_DOC_VERSION,
    canvas: { w: CANVAS_WIDTH, h: CANVAS_HEIGHT },
    background,
    flattenedStoragePath: null,
    scrim: { enabled: true, color: identity.palette.surface, opacity: 0.35, mode: 'bottom' },
    layers,
  }
}

/**
 * Refresh role-seeded layers from rewritten copy (wizard recompose): headline/body layers take the
 * new text unless the user hand-edited them (`textOverridden`); custom layers are never touched.
 */
export function applyCopyToDoc(
  doc: CanvasDoc,
  input: Pick<SeedInput, 'identity' | 'slide' | 'caption'>
): CanvasDoc {
  const style = getBrandStyle(input.identity.style)
  const headline = input.slide ? sanitizePromptText(input.slide.headline) : captionHook(input.caption)
  const body = input.slide ? sanitizePromptText(input.slide.body) : ''
  const layers = doc.layers.map((layer) => {
    if (layer.textOverridden) return layer
    if (layer.role === 'headline' && headline) {
      return { ...layer, text: style.fonts.headlineUppercase ? headline.toUpperCase() : headline }
    }
    if (layer.role === 'body' && body) return { ...layer, text: body }
    return layer
  })
  return { ...doc, layers }
}

/** A fresh layer for the editor's "Add text" button, in the style's body font. */
export function createTextLayer(role: CanvasTextRole, identity: SeedIdentity): CanvasTextLayer {
  const style = getBrandStyle(identity.style)
  return {
    id: crypto.randomUUID(),
    role,
    text: 'New text',
    x: TEXT_X,
    y: CANVAS_HEIGHT / 2,
    width: TEXT_WIDTH,
    fontFamily: style.fonts.body,
    fontSize: BODY_SIZE,
    fontWeight: 400,
    fill: identity.palette.ink,
    align: 'left',
    lineHeight: 1.35,
  }
}

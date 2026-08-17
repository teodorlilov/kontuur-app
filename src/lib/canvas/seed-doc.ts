import type {
  CanvasBackgroundRef,
  CanvasDoc,
  CanvasTextNode,
  CanvasTextRole,
} from '@/types/canvas'
import { isTextNode } from './doc-nodes'
import { splitHero } from './lockups'
import type { Palette } from '@/types/visual'
import { getBrandStyle } from '@/lib/visual/brand-styles'
import { clampAtWordBoundary, sanitizePromptText } from '@/lib/visual/prompt'
import { CANVAS_DOC_VERSION, CANVAS_HEIGHT, CANVAS_WIDTH } from './constants'
import type { SlideText } from '@/types/slide'

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
  slide?: SlideText
  /** Single-post caption; its hook becomes the one seeded headline. */
  caption?: string | null
}

/**
 * Build the first canvas doc for a slide: copy placed in the brand style's font pairing over the
 * clean background, contrast scrim on. Empty copy seeds no node — callers can skip composing a
 * doc with no text.
 */
export function seedCanvasDoc(input: SeedInput): CanvasDoc {
  const { identity, background, slide, caption } = input
  const style = getBrandStyle(identity.style)
  const headlineText = slide ? sanitizePromptText(slide.headline) : captionHook(caption)
  const bodyText = slide ? sanitizePromptText(slide.body) : ''
  const nodes: CanvasTextNode[] = []

  if (headlineText) {
    nodes.push({
      id: crypto.randomUUID(),
      kind: 'text',
      role: 'headline',
      text: headlineText,
      ...(style.fonts.headlineUppercase ? { uppercase: true } : {}),
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
    nodes.push({
      id: crypto.randomUUID(),
      kind: 'text',
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
    nodes,
  }
}

/**
 * Refresh role-seeded text from rewritten copy (wizard recompose): headline/body nodes take the
 * new text unless the user hand-edited them (`textOverridden`); custom text is never touched.
 */
export function applyCopyToDoc(
  doc: CanvasDoc,
  input: Pick<SeedInput, 'slide' | 'caption'>
): CanvasDoc {
  const headline = input.slide ? sanitizePromptText(input.slide.headline) : captionHook(input.caption)
  const body = input.slide ? sanitizePromptText(input.slide.body) : ''
  /**
   * A slide wearing a hero lockup holds its headline in TWO nodes, and they must be refreshed — or
   * left alone — as ONE unit.
   *
   * `textOverridden` is stamped per node, so treating the halves independently produced sentences
   * nobody wrote: a user who retyped the poster word to "Seven" and then received a rewrite of
   * "Ten tips for founders" got a slide reading "Seven tips for founders", with the rewrite's own
   * first word appearing nowhere. On this app's "Ten tips…" copy the number and the noun then come
   * from different sentences, and the recompose bakes and publishes it without a word of warning.
   */
  const heroSplit = doc.nodes.some((node) => isTextNode(node) && node.role === 'hero')
  const keepHeadline = doc.nodes.some(
    (node) =>
      isTextNode(node) &&
      (node.role === 'hero' || node.role === 'headline') &&
      node.textOverridden
  )
  const split = heroSplit ? splitHero(headline) : { hero: '', rest: headline }
  const nodes = doc.nodes.map((node) => {
    if (!isTextNode(node)) return node
    // Case is a render-time flag, so refreshed copy stays raw here.
    if (node.role === 'hero') return keepHeadline || !headline ? node : { ...node, text: split.hero }
    if (node.role === 'headline') {
      return keepHeadline || !headline ? node : { ...node, text: split.rest }
    }
    if (node.role === 'body' && body && !node.textOverridden) return { ...node, text: body }
    return node
  })
  return { ...doc, nodes }
}

/** A fresh text node for the editor's "Add text" button, in the style's body font. */
export function createTextNode(role: CanvasTextRole, identity: SeedIdentity): CanvasTextNode {
  const style = getBrandStyle(identity.style)
  return {
    id: crypto.randomUUID(),
    kind: 'text',
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

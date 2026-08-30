import type { CanvasBackgroundRef, CanvasDoc, CanvasTextNode, CanvasTextRole } from '@/types/canvas'
import { isTextNode } from './doc-nodes'
import {
  applyLockup,
  headlineOverridden,
  lockupBlock,
  lockupMemberIds,
  slideCopy,
  splitHero,
  LOCKUPS,
  type LockupContext,
} from './lockups'
import { variantIndex, type VariationKey } from '@/lib/visual/variation'
import type { Palette } from '@/types/visual'
import { fontsFor, type BrandFontChoice } from '@/lib/visual/brand-styles'
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
  /** The client's name, for the `quote` lockup's byline. Absent → that lockup sets no attribution. */
  clientName?: string
  /** The client's own type pairing, overriding the style's. Absent = the style decides. */
  fonts?: BrandFontChoice
}

interface SeedInput {
  identity: SeedIdentity
  background: CanvasBackgroundRef
  /** Carousel copy for this position; omit for single posts. */
  slide?: SlideText
  /** Single-post caption; its hook becomes the one seeded headline. */
  caption?: string | null
  /**
   * Which slide of which post this is. Present → the type gets a designed layout chosen from the
   * lockup catalogue; absent → the plain fixed geometry below.
   */
  variation?: VariationKey
}

/**
 * Build the first canvas doc for a slide: copy placed in the brand style's font pairing over the
 * clean background, no backdrop. Empty copy seeds no node — callers can skip composing a doc with
 * no text.
 *
 * The backdrop starts OFF and solid: a slide opens showing the picture that was generated for it,
 * and the first colour picked covers that picture outright rather than half-veiling it. Readability
 * over a busy photograph is `recolourForBackdrop`'s job — it repaints the type against a
 * measurement of the art, which is a better answer than washing every slide by default.
 */
export function seedCanvasDoc(input: SeedInput): CanvasDoc {
  const { identity, background, slide, caption, variation } = input
  // The client's pairing where they have one, else their style's.
  const fonts = fontsFor(identity)
  const headlineText = slide ? sanitizePromptText(slide.headline) : captionHook(caption)
  const bodyText = slide ? sanitizePromptText(slide.body) : ''
  const nodes: CanvasTextNode[] = []

  if (headlineText) {
    nodes.push({
      id: crypto.randomUUID(),
      kind: 'text',
      role: 'headline',
      text: headlineText,
      ...(fonts.headlineUppercase ? { uppercase: true } : {}),
      x: TEXT_X,
      y: HEADLINE_Y,
      width: TEXT_WIDTH,
      fontFamily: fonts.display,
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
      fontFamily: fonts.body,
      fontSize: BODY_SIZE,
      fontWeight: 400,
      fill: identity.palette.ink,
      align: 'left',
      lineHeight: 1.35,
    })
  }

  const doc: CanvasDoc = {
    version: CANVAS_DOC_VERSION,
    canvas: { w: CANVAS_WIDTH, h: CANVAS_HEIGHT },
    background,
    flattenedStoragePath: null,
    backdrop: { enabled: false, color: identity.palette.surface, opacity: 1 },
    nodes,
  }
  if (!variation || nodes.length === 0) return doc

  return dressInLockup(
    doc,
    {
      palette: identity.palette,
      fonts,
      slide: { position: variation.position },
      ...(identity.clientName ? { brandName: identity.clientName } : {}),
    },
    variation
  )
}

/**
 * Lay the seeded copy out in a designed lockup instead of the flat geometry above.
 *
 * The catalogue has always held sixteen compositions and, until now, was reachable only by opening
 * the editor and clicking — so every slide the app generated on its own wore the same margins, the
 * same sizes and the same two faces. Most posts are published without the editor ever being opened,
 * which made "sixteen layouts" true of the product and false of its output.
 *
 * Candidates are filtered through `lockupBlock`, the catalogue's own answer to "can this lockup hold
 * this copy" — it covers both the Cyrillic script gate and the per-slot capacity, and asking either
 * question again here is how the picker and apply-to-all once came to disagree. If nothing fits, the
 * flat geometry stands: it has no capacity limit, which is exactly what makes it the right fallback.
 */
function dressInLockup(doc: CanvasDoc, ctx: LockupContext, variation: VariationKey): CanvasDoc {
  const copy = slideCopy(doc)
  const candidates = LOCKUPS.filter((lockup) => {
    const blocked = lockupBlock(lockup, ctx, copy)
    return !blocked.wrongScript && !blocked.tooMuchCopy
  })
  if (candidates.length === 0) return doc

  const chosen = candidates[variantIndex(variation, candidates.length, 'lockup')]
  if (!chosen) return doc
  const ids = lockupMemberIds(doc, chosen.id, ctx, () => crypto.randomUUID())
  return applyLockup(doc, chosen.id, ctx, ids)
}

/**
 * Refresh role-seeded text from rewritten copy (wizard recompose): headline/body nodes take the
 * new text unless the user hand-edited them (`textOverridden`); custom text is never touched.
 */
export function applyCopyToDoc(
  doc: CanvasDoc,
  input: Pick<SeedInput, 'slide' | 'caption'>
): CanvasDoc {
  const headline = input.slide
    ? sanitizePromptText(input.slide.headline)
    : captionHook(input.caption)
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
  // The catalogue's own predicate, not a second copy of it. Both halves of a hero split answer
  // together — which is the whole point of the paragraph above — and two independently maintained
  // versions of "together" is exactly how they would come to disagree.
  const keepHeadline = headlineOverridden(doc)
  const split = heroSplit ? splitHero(headline) : { hero: '', rest: headline }
  const nodes = doc.nodes.map((node) => {
    if (!isTextNode(node)) return node
    // Case is a render-time flag, so refreshed copy stays raw here.
    if (node.role === 'hero')
      return keepHeadline || !headline ? node : { ...node, text: split.hero }
    if (node.role === 'headline') {
      return keepHeadline || !headline ? node : { ...node, text: split.rest }
    }
    if (node.role === 'body' && body && !node.textOverridden) return { ...node, text: body }
    return node
  })
  return { ...doc, nodes }
}

/** A fresh text node for the editor's "Add text" button, in the identity's body font. */
export function createTextNode(role: CanvasTextRole, identity: SeedIdentity): CanvasTextNode {
  const fonts = fontsFor(identity)
  return {
    id: crypto.randomUUID(),
    kind: 'text',
    role,
    text: 'New text',
    x: TEXT_X,
    y: CANVAS_HEIGHT / 2,
    width: TEXT_WIDTH,
    fontFamily: fonts.body,
    fontSize: BODY_SIZE,
    fontWeight: 400,
    fill: identity.palette.ink,
    align: 'left',
    lineHeight: 1.35,
  }
}

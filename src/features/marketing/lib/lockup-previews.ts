import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/lib/canvas/constants'
import { LOCKUPS, lockupBlock, type LockupContext } from '@/lib/canvas/lockups'
import { getBrandStyle } from '@/lib/visual/brand-styles'
import type { CanvasTextNode } from '@/types/canvas'
import type { Palette } from '@/types/visual'
import { lockupFontStack } from './lockup-fonts'

/**
 * The landing page's editor demo, derived from the SHIPPED catalogue at build time.
 *
 * Server-side on purpose. `lockups.ts` is fourteen hundred lines and drags `font-library.ts` behind
 * it; importing it from a client component would put all of that in the public page's bundle to draw
 * six previews. Resolved here, what crosses to the browser is a few kilobytes of plain geometry.
 *
 * Derived rather than transcribed for the same reason the picker's tiles are: a hand-copied layout
 * is a layout that silently stops matching the product the first time anyone tunes it, and the whole
 * claim this section makes is that these are the real thing.
 */

/** Authoring space, restated for the client so it does not import the canvas constants for two numbers. */
export const PREVIEW_CANVAS = { w: CANVAS_WIDTH, h: CANVAS_HEIGHT } as const

/** One drawn box, already reduced to what the DOM needs. */
export interface PreviewBox {
  x: number
  y: number
  width: number
}

export interface PreviewText extends PreviewBox {
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  italic: boolean
  lineHeight: number
  letterSpacing: number
  align: 'left' | 'center' | 'right'
  fill: string
}

export interface PreviewShape extends PreviewBox {
  height: number
  fill: string
}

export interface LockupPreview {
  id: string
  label: string
  description: string
  texts: PreviewText[]
  shapes: PreviewShape[]
  /** Why this lockup will not take this slide's copy, in the user's words — or null when it will. */
  blocked: string | null
}

/**
 * A stand-in client, because a lockup takes the CLIENT's palette rather than ours.
 *
 * Deliberately not Kontuur green. The section's argument is that these layouts wear the brand they
 * are made for, and demonstrating it in our own colour would quietly say the opposite.
 */
const SAMPLE_PALETTE: Palette = {
  surface: '#FFFFFF',
  ink: '#12100E',
  accent: '#0F5C63',
  'accent-deep': '#0A3F45',
  line: '#E4E4E4',
}

/** Sample copy, short enough that most of the pack can hold it and one honestly cannot. */
export const SAMPLE_COPY = {
  headline: 'Cold brew, twelve hours',
  body: 'New on the summer menu, from Tuesday.',
} as const

function toText(node: Pick<CanvasTextNode, never> & CanvasTextNode, text: string): PreviewText {
  return {
    x: node.x,
    y: node.y,
    width: node.width,
    // Konva has no text-transform: capitals are applied to the drawn string, exactly as the editor
    // and the exporter do it, so the preview wraps where the slide wraps.
    text: node.uppercase ? text.toUpperCase() : text,
    fontFamily: lockupFontStack(node.fontFamily),
    fontSize: node.fontSize,
    fontWeight: node.fontWeight,
    italic: node.italic === true,
    lineHeight: node.lineHeight,
    letterSpacing: node.letterSpacing ?? 0,
    align: node.align,
    fill: node.fill,
  }
}

/**
 * Every lockup in one pack, laid out around the sample copy.
 *
 * The Layouts pack, and all six of it. Essentials spans sixteen families where this spans seven, and
 * a public page cannot justify twenty-three display faces — but a pack shown WHOLE is an honest
 * sample in a way that six hand-picked winners would not be.
 */
export function layoutsPackPreviews(): LockupPreview[] {
  const ctx: LockupContext = {
    palette: SAMPLE_PALETTE,
    // The default pairing, resolved the way every caller does — a lockup that leans on the style's
    // fonts rather than pinning its own then shows what a real client would get.
    fonts: getBrandStyle(undefined).fonts,
    slide: { position: 2, total: 6 },
  }

  return LOCKUPS.filter((lockup) => lockup.pack === 'layouts').map((lockup) => {
    const copy = lockup.copy(ctx)
    const block = lockupBlock(lockup, ctx, SAMPLE_COPY)
    const texts: PreviewText[] = []
    const shapes: PreviewShape[] = []

    // Members first: array order is render order, and a lockup's furniture belongs under its copy.
    for (const member of lockup.members(ctx)) {
      if (member.kind === 'text') {
        texts.push(toText(member as CanvasTextNode, member.text))
      } else {
        shapes.push({
          x: member.x,
          y: member.y,
          width: member.width,
          height: member.height,
          // A rect carries `fill`; a rule is nothing but its `stroke`.
          fill: member.fill ?? member.stroke ?? 'transparent',
        })
      }
    }
    if (copy.hero) texts.push(toText(copy.hero as CanvasTextNode, SAMPLE_COPY.headline))
    texts.push(toText(copy.headline as CanvasTextNode, SAMPLE_COPY.headline))
    texts.push(toText(copy.body as CanvasTextNode, SAMPLE_COPY.body))

    return {
      id: lockup.id,
      label: lockup.label,
      description: lockup.description,
      texts,
      shapes,
      blocked: block.tooMuchCopy ? 'Needs shorter' : null,
    }
  })
}

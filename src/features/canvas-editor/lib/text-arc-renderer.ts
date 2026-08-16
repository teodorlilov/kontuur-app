import Konva from 'konva'
import { stringToArray, type CharRenderProps } from 'konva/lib/shapes/Text'
import { arcPointAt } from '@/lib/canvas/text-arc'
import { textNodeAttrs } from '@/lib/canvas/node-attrs'
import type { CanvasTextNode } from '@/types/canvas'

export type CharRenderer = (props: CharRenderProps) => void

// Its own detached Text, NOT the one `measure-fit.ts` shares. That one is reconfigured per node
// from `textNodeAttrs`, and per-character measuring here would race a wrap measurement there.
let advanceMeasurer: Konva.Text | null = null

/** The advance Konva itself will use for one grapheme — the same `measureSize` call its walk makes. */
function measureAdvance(node: CanvasTextNode, char: string): number {
  if (!advanceMeasurer) advanceMeasurer = new Konva.Text({ listening: false })
  advanceMeasurer.setAttrs({ ...textNodeAttrs(node), width: undefined, height: undefined })
  return advanceMeasurer.measureSize(char).width
}

/**
 * Konva's per-character hook, bending one line of text onto an arc — or `undefined` when the node
 * is straight, which is what keeps a bend of zero pixel-identical rather than merely close.
 *
 * The bend must NOT be expressed by installing a no-op renderer: `Text.js:189` switches into the
 * per-character drawing path on the mere PRESENCE of this function, and that path advances glyph by
 * glyph through `measureSize`, dropping every kern pair. A straight node has to keep the
 * whole-string path, so an absent bend returns nothing at all.
 *
 * Single line only, deliberately. Konva calls back per line, but the arc needs each line's total
 * advance up front, and the only way to know where Konva wrapped is to replicate its wrap — so a
 * node that has wrapped is left straight and the toolbar says why.
 */
export function arcCharRenderer(node: CanvasTextNode): CharRenderer | undefined {
  const bend = node.arcBend ?? 0
  if (!bend) return undefined

  const drawn = node.uppercase ? node.text.toUpperCase() : node.text
  // Konva's own splitter, not `Array.from` or `split('')`: the walk this mirrors uses it, so a
  // surrogate pair or a combining mark has to break into the same units or the arc counts glyphs
  // the renderer never draws separately.
  const graphemes = stringToArray(drawn)
  if (graphemes.length === 0) return undefined

  // The line's whole advance, walked exactly as Konva will walk it: per-grapheme `measureSize`
  // plus the tracking between them. Measuring the string in one call would include kerning that
  // the per-character path does not apply, and the arc would run wide of the glyphs.
  const spacing = node.letterSpacing ?? 0
  const advance =
    graphemes.reduce((total, char) => total + measureAdvance(node, char), 0) +
    spacing * Math.max(0, graphemes.length - 1)

  // Where the line starts, learned from the first callback rather than recomputed: Konva has
  // already applied the alignment offset by then, so this needs no knowledge of `align` at all.
  let lineOrigin: number | null = null

  return (props) => {
    if (props.column === 0) lineOrigin = props.x
    const origin = lineOrigin ?? props.x
    // Konva fills at (props.x, props.y), so the glyph's baseline CENTRE is half an advance along.
    const centreX = props.x + props.width / 2
    const point = arcPointAt(centreX - origin, advance, bend)

    // Move the glyph's centre onto the curve and turn it to the tangent. The final translate undoes
    // the position Konva is about to fill at, so the composition lands the fill on the point.
    const ctx = props.context
    ctx.translate(origin + point.x, props.y + point.y)
    ctx.rotate(point.angle)
    ctx.translate(-centreX, -props.y)
  }
}

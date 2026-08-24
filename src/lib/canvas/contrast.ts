/**
 * Choosing a text colour the picture underneath will actually let you read.
 *
 * The brand palette decides what the type COULD be; the pixels behind it decide what it must be.
 * Seeding got away with picking `palette.ink` unconditionally because the image prompt reserves the
 * zones seeded text lands in — "keep the top quarter and the lower half of the canvas calm and
 * uncluttered, text will be overlaid there". Lockups broke that bargain: they put a headline at the
 * optical centre, a numeral at y=300, a hero at y=210, all through the busiest band of the picture,
 * which nothing ever reserved.
 *
 * So the fill is resolved against a measurement of the art rather than assumed. Everything here is
 * pure — the sampling that produces a `BackdropGrid` needs a canvas and lives in the editor.
 */

import { contrastRatio, parseHex, type Rgb } from '@/lib/visual/extract/color'
import { isTextNode, textLabel } from './doc-nodes'
import type { CanvasDoc, CanvasTextNode } from '@/types/canvas'
import type { Palette } from '@/types/visual'

/**
 * WCAG AA for large text.
 *
 * 3:1, not the 4.5:1 body-copy figure: everything a lockup places is display-sized, and holding
 * 96px type to the small-print threshold would repaint slides that read perfectly well.
 */
export const CONTRAST_FLOOR = 3

/**
 * A coarse luminance map of the composed background, in canvas coordinates.
 *
 * Coarse on purpose. The question is "is this region light or dark", and answering it from a
 * 108×135 sample of a 1080×1350 image costs a hundredth of the pixels for the same answer.
 */
export interface BackdropGrid {
  /** Cells across and down. */
  cols: number
  rows: number
  /** Mean colour per cell, row-major. */
  cells: Rgb[]
  /** The canvas the grid was measured against, so a box in doc coordinates can be located. */
  canvas: { w: number; h: number }
}

/**
 * The mean colour under a box in doc coordinates.
 *
 * Per-box rather than per-image: a headline over pale sky and a body over a dark trolley need
 * opposite answers, and averaging the whole picture would give both the same wrong one. A box that
 * falls entirely outside the canvas returns null — there is nothing behind it to contrast with.
 */
export function backdropAt(
  grid: BackdropGrid,
  box: { x: number; y: number; width: number; height: number }
): Rgb | null {
  const x0 = Math.max(0, Math.floor((box.x / grid.canvas.w) * grid.cols))
  const x1 = Math.min(grid.cols, Math.ceil(((box.x + box.width) / grid.canvas.w) * grid.cols))
  const y0 = Math.max(0, Math.floor((box.y / grid.canvas.h) * grid.rows))
  const y1 = Math.min(grid.rows, Math.ceil(((box.y + box.height) / grid.canvas.h) * grid.rows))
  if (x1 <= x0 || y1 <= y0) return null

  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const cell = grid.cells[y * grid.cols + x]
      if (!cell) continue
      r += cell.r
      g += cell.g
      b += cell.b
      n++
    }
  }
  if (n === 0) return null
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
}

/**
 * The candidate that contrasts best with the backdrop, and by how much.
 *
 * Candidates are the client's OWN colours first — repainting brand ink as plain black is a last
 * resort, not an opening move — so the caller passes them in preference order and ties keep the
 * earliest. `haloFor` in `text-effects.ts` makes the same black-or-white judgement for outlines;
 * this is the same idea given a real measurement instead of the text's own colour.
 */
export function bestFill(
  candidates: readonly string[],
  backdrop: Rgb
): { fill: string; ratio: number } | null {
  let best: { fill: string; ratio: number } | null = null
  for (const candidate of candidates) {
    const rgb = parseHex(candidate)
    if (!rgb) continue
    const ratio = contrastRatio(rgb, backdrop)
    if (!best || ratio > best.ratio) best = { fill: candidate, ratio }
  }
  return best
}

/** A text node's unrotated box. Height is budgeted at one line — enough to sample the right band. */
export function textBox(
  node: Pick<CanvasTextNode, 'x' | 'y' | 'width' | 'fontSize' | 'lineHeight'>
) {
  return {
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.fontSize * node.lineHeight,
  }
}

/**
 * The client's colours in the order a repaint should try them.
 *
 * Their own ink first, then surface, then the deep accent — repainting brand colour as generic
 * black is a last resort, and `bestFill` keeps the earliest on a tie. Black and white close the
 * list because they are what GUARANTEE a fix exists: against any backdrop the better of the two
 * scores at least 4.58:1, which no palette can promise (a client whose ink and surface are both
 * mid-tone defeats them together).
 *
 * One definition, because the editor, the tile previews and the compose pipeline must all repaint
 * to the same colour or the preview stops predicting the export.
 */
export function fillCandidates(palette: Palette): string[] {
  return [palette.ink, palette.surface, palette['accent-deep'], '#000000', '#FFFFFF']
}

/**
 * The colour this text should actually be drawn in over this backdrop.
 *
 * Returns the fill unchanged when it already clears the floor, or when nothing can rescue it —
 * so a caller can use it as "the readable colour" without deciding anything itself.
 */
export function readableFill(
  grid: BackdropGrid,
  box: { x: number; y: number; width: number; height: number },
  fill: string,
  candidates: readonly string[]
): string {
  const backdrop = backdropAt(grid, box)
  if (!backdrop) return fill
  const current = parseHex(fill)
  if (current && contrastRatio(current, backdrop) >= CONTRAST_FLOOR) return fill
  const best = bestFill(candidates, backdrop)
  return best && best.ratio >= CONTRAST_FLOOR ? best.fill : fill
}

/**
 * Repaint every text node whose colour the picture is swallowing.
 *
 * Only nodes that FAIL the floor are touched: a slide the art already suits keeps the exact colours
 * the lockup and the brand chose. When no candidate clears the floor the node keeps its fill and is
 * reported by `lowContrastLabels` instead — silently painting it a colour that is merely the least
 * bad would hide the fact that the real fix is a backdrop or a different picture.
 */
export function recolourForBackdrop(
  doc: CanvasDoc,
  grid: BackdropGrid,
  candidates: readonly string[]
): CanvasDoc {
  let changed = false
  const nodes = doc.nodes.map((node) => {
    if (!isTextNode(node)) return node
    const fill = readableFill(grid, textBox(node), node.fill, candidates)
    if (fill === node.fill) return node
    changed = true
    return { ...node, fill }
  })
  // The same doc reference when nothing moved, so a no-op never lands as an undo step.
  return changed ? { ...doc, nodes } : doc
}

/**
 * The text nodes the picture is still swallowing, by their own words — so a warning can name what
 * to fix rather than saying something is wrong somewhere.
 *
 * Reported AFTER a repaint has had its chance, so anything listed here genuinely has no colour in
 * the palette that works: the answer is a backdrop, a different crop, or moving the text.
 */
export function lowContrastLabels(doc: CanvasDoc, grid: BackdropGrid): string[] {
  return doc.nodes
    .filter(isTextNode)
    .filter((node) => {
      const backdrop = backdropAt(grid, textBox(node))
      const fill = parseHex(node.fill)
      if (!backdrop || !fill) return false
      return contrastRatio(fill, backdrop) < CONTRAST_FLOOR
    })
    .map(textLabel)
}

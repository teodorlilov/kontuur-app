import Konva from 'konva'
import type { CanvasDoc, CanvasTextNode } from '@/types/canvas'
import { computeFit } from '@/lib/canvas/autofit'
import { TEXT_BOTTOM_MARGIN } from '@/lib/canvas/constants'
import { isTextNode } from '@/lib/canvas/doc-nodes'
import { markerBands, type MarkerBandAttrs } from '@/lib/canvas/highlight'
import { textNodeAttrs } from '@/lib/canvas/node-attrs'

const MIN_FONT_SIZE = 24
const FIT_SCALE = 1.15

// One detached Konva.Text reused for all measurements (fonts must be ready before measuring).
let measurer: Konva.Text | null = null

// The measurer configured for a node — Konva recomputes its wrap synchronously on setAttrs.
function measureText(node: CanvasTextNode, fontSize: number): Konva.Text {
  if (!measurer) measurer = new Konva.Text({ listening: false })
  measurer.setAttrs({ ...textNodeAttrs(node), fontSize, height: undefined })
  return measurer
}

function measuredHeight(node: CanvasTextNode, fontSize: number): number {
  return measureText(node, fontSize).height()
}

/**
 * Whether the node's text fits on one line at its current width.
 *
 * The arc needs it: bending works per line, and the renderer would have to replicate Konva's own
 * wrap to know where each line starts and how long it is. A wrapped node stays straight.
 */
export function isSingleLine(node: CanvasTextNode): boolean {
  return measureText(node, node.fontSize).textArr.length <= 1
}

/** Marker-band rects for the node's current wrap; [] when it has no highlight. */
export function highlightBands(node: CanvasTextNode): MarkerBandAttrs[] {
  if (!node.highlight) return []
  return markerBands(measureText(node, node.fontSize).textArr, node)
}

function availableHeight(node: CanvasTextNode, canvasH: number): number {
  return canvasH - node.y - TEXT_BOTTOM_MARGIN
}

// The largest scale-step font size (≤ the node's own) at which the text fits its slot.
function fittedFontSize(node: CanvasTextNode, canvasH: number): number {
  const max = availableHeight(node, canvasH)
  const outcome = computeFit((size) => measuredHeight(node, size) <= max, {
    startSize: node.fontSize,
    min: MIN_FONT_SIZE,
    scale: FIT_SCALE,
  })
  return Math.round(outcome.size)
}

// True when the text exceeds its slot even at the current size. Deliberately ignores rotation
// (unrotated y + height): seeded text is never rotated, and a hand-tilted node's exact extent
// isn't worth the math for a cosmetic badge.
function textOverflows(node: CanvasTextNode, canvasH: number): boolean {
  return measuredHeight(node, node.fontSize) > availableHeight(node, canvasH)
}

/** Autofit every seeded text node once, on first open — what you see is what the doc stores. */
export function autofitDocText(doc: CanvasDoc): CanvasDoc {
  const nodes = doc.nodes.map((node) => {
    if (!isTextNode(node)) return node
    const size = fittedFontSize(node, doc.canvas.h)
    return size === node.fontSize ? node : { ...node, fontSize: size }
  })
  return { ...doc, nodes }
}

/** The overflowing text nodes' own words, so the warning can name what to fix. */
export function overflowingTextLabels(doc: CanvasDoc): string[] {
  return doc.nodes
    .filter(isTextNode)
    .filter((node) => textOverflows(node, doc.canvas.h))
    .map((node) => node.text.trim().split('\n')[0] || 'Empty text layer')
}

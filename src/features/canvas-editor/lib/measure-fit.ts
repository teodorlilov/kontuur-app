import Konva from 'konva'
import type { CanvasDoc, CanvasTextLayer } from '@/types/canvas'
import { computeFit } from '@/lib/canvas/autofit'
import { textNodeAttrs } from '@/lib/canvas/node-attrs'

/** Breathing room kept below the lowest text line in the authoring space. */
const BOTTOM_MARGIN = 48
const MIN_FONT_SIZE = 24
const FIT_SCALE = 1.15

// One detached Konva.Text reused for all measurements (fonts must be ready before measuring).
let measurer: Konva.Text | null = null

function measuredHeight(layer: CanvasTextLayer, fontSize: number): number {
  if (!measurer) measurer = new Konva.Text({ listening: false })
  measurer.setAttrs({ ...textNodeAttrs(layer), fontSize, height: undefined })
  return measurer.height()
}

function availableHeight(layer: CanvasTextLayer, canvasH: number): number {
  return canvasH - layer.y - BOTTOM_MARGIN
}

// The largest scale-step font size (≤ the layer's own) at which the text fits its slot.
function fittedFontSize(layer: CanvasTextLayer, canvasH: number): number {
  const max = availableHeight(layer, canvasH)
  const outcome = computeFit((size) => measuredHeight(layer, size) <= max, {
    startSize: layer.fontSize,
    min: MIN_FONT_SIZE,
    scale: FIT_SCALE,
  })
  return Math.round(outcome.size)
}

// True when the layer's text exceeds its slot even at the current size.
function layerOverflows(layer: CanvasTextLayer, canvasH: number): boolean {
  return measuredHeight(layer, layer.fontSize) > availableHeight(layer, canvasH)
}

/** Autofit every seeded layer once, on first open — what you see is what the doc stores. */
export function autofitDocLayers(doc: CanvasDoc): CanvasDoc {
  const layers = doc.layers.map((layer) => {
    const size = fittedFontSize(layer, doc.canvas.h)
    return size === layer.fontSize ? layer : { ...layer, fontSize: size }
  })
  return { ...doc, layers }
}

/** True when any layer overflows its slot at its current size. */
export function docOverflows(doc: CanvasDoc): boolean {
  return doc.layers.some((layer) => layerOverflows(layer, doc.canvas.h))
}

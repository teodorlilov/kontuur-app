import type { CanvasTextLayer } from '@/types/canvas'

/** Band height as a share of the font size — covers the x-height like a real marker swipe. */
const BAND_HEIGHT_RATIO = 0.8
/** Horizontal overshoot past the glyphs on each side, as a share of the font size. */
const BAND_OVERSHOOT_RATIO = 0.3
/** Deterministic per-line tilt cycle (degrees) — hand-swiped feel without randomness, so the
 *  editor, re-renders and the export all draw the identical bands. */
const BAND_WOBBLE_CYCLE = [-1.5, 1, -0.8] as const

/** One marker band, Konva.Rect-ready, positioned relative to the text layer's origin. */
export interface MarkerBandAttrs {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  cornerRadius: number
  fill: string
}

// Where a line's glyphs start horizontally inside the layer box, per alignment.
function lineOffsetX(layer: Pick<CanvasTextLayer, 'width' | 'align'>, lineWidth: number): number {
  if (layer.align === 'center') return (layer.width - lineWidth) / 2
  if (layer.align === 'right') return layer.width - lineWidth
  return 0
}

/**
 * Marker-highlight bands for a layer's wrapped lines (widths as Konva measured them): one pill
 * per non-empty line, centred on the line box, overshooting the glyphs, gently tilted. Both the
 * editor stage and the exporter consume these attrs verbatim — band appearance has one home.
 */
export function markerBands(
  lines: ReadonlyArray<{ width: number }>,
  layer: Pick<CanvasTextLayer, 'width' | 'align' | 'fontSize' | 'lineHeight' | 'highlight'>
): MarkerBandAttrs[] {
  if (!layer.highlight) return []
  const fill = layer.highlight
  const lineBox = layer.fontSize * layer.lineHeight
  const height = layer.fontSize * BAND_HEIGHT_RATIO
  const overshoot = layer.fontSize * BAND_OVERSHOOT_RATIO

  const bands: MarkerBandAttrs[] = []
  lines.forEach((line, index) => {
    if (line.width <= 0) return
    bands.push({
      x: lineOffsetX(layer, line.width) - overshoot,
      y: index * lineBox + (lineBox - height) / 2,
      width: line.width + overshoot * 2,
      height,
      rotation: BAND_WOBBLE_CYCLE[index % BAND_WOBBLE_CYCLE.length]!,
      cornerRadius: height / 2,
      fill,
    })
  })
  return bands
}

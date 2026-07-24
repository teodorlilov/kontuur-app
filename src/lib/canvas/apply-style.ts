import type { CanvasDoc, CanvasTextLayer } from '@/types/canvas'

// The "look" of a layer — everything except identity (id/role) and content (text/textOverridden).
// Copying an oversized fontSize is fine: compose autofits each slide's own text downstream.
function styledLayer(target: CanvasTextLayer, source: CanvasTextLayer): CanvasTextLayer {
  return {
    ...target,
    x: source.x,
    y: source.y,
    width: source.width,
    fontFamily: source.fontFamily,
    fontSize: source.fontSize,
    fontWeight: source.fontWeight,
    fill: source.fill,
    align: source.align,
    lineHeight: source.lineHeight,
  }
}

/**
 * Carry one slide's look onto another doc ("apply to all slides"): the scrim plus each
 * headline/body layer's style, matched by role. Text, `textOverridden` and `custom` layers are
 * never touched; roles missing on either side are left alone (no layer is ever created).
 */
export function applyStyleToDoc(target: CanvasDoc, source: CanvasDoc): CanvasDoc {
  const layers = target.layers.map((layer) => {
    if (layer.role === 'custom') return layer
    const sourceLayer = source.layers.find((candidate) => candidate.role === layer.role)
    return sourceLayer ? styledLayer(layer, sourceLayer) : layer
  })
  return { ...target, scrim: { ...source.scrim }, layers }
}

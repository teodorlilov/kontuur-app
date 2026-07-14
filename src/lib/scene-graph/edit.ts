import type { Composition, Layer, Rect } from './types'

/**
 * Pure, immutable edits to a composition — the model the visual editor's canvas interactions map onto
 * (drag → rect, resize → rect, text edit → content). Konva-free and fully unit-tested, so the canvas
 * component stays thin glue over verified logic. Every function returns a new composition; inputs are
 * never mutated.
 */

/** The top-level layers a user can select and manipulate — visible and unlocked. */
export function selectableLayers(composition: Composition): Layer[] {
  return composition.layers.filter((l) => !l.locked && !l.hidden)
}

export function findLayer(composition: Composition, layerId: string): Layer | undefined {
  return composition.layers.find((l) => l.id === layerId)
}

/** Immutably replace one layer by id (a no-op if the id isn't present). */
export function updateLayer(composition: Composition, layerId: string, patch: (layer: Layer) => Layer): Composition {
  return { ...composition, layers: composition.layers.map((l) => (l.id === layerId ? patch(l) : l)) }
}

/** Set a layer's rect — the drag/resize sink. */
export function setLayerRect(composition: Composition, layerId: string, rect: Rect): Composition {
  return updateLayer(composition, layerId, (l) => ({ ...l, rect }))
}

/**
 * Keep a moved layer at least partly on-canvas so its handles stay grabbable — clamp the top-left so at
 * least `margin` px of the box remains within the canvas on every edge. Size and rotation are untouched.
 */
export function clampRectToCanvas(rect: Rect, size: { w: number; h: number }, margin = 48): Rect {
  const m = Math.min(margin, rect.w, rect.h)
  const x = Math.min(Math.max(rect.x, m - rect.w), size.w - m)
  const y = Math.min(Math.max(rect.y, m - rect.h), size.h - m)
  return { ...rect, x, y }
}

/** Set a text layer's content (a no-op on non-text layers). */
export function setTextContent(composition: Composition, layerId: string, content: string): Composition {
  return updateLayer(composition, layerId, (l) => (l.type === 'text' ? { ...l, content } : l))
}

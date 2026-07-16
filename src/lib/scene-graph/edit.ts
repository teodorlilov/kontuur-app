import type { Binding, ColorRole, Composition, Layer, Rect, Treatment } from './types'

const lit = <T>(value: T): Binding<T> => ({ mode: 'literal', value })
const boundColor = (role: ColorRole): Binding<string> => ({ mode: 'bound', token: `color.${role}` })

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

/** Append a layer (paint order = last = on top) — the editor's insert (e.g. a brand vector mark). */
export function addLayer(composition: Composition, layer: Layer): Composition {
  return { ...composition, layers: [...composition.layers, layer] }
}

/** Remove a layer by id. */
export function removeLayer(composition: Composition, layerId: string): Composition {
  return { ...composition, layers: composition.layers.filter((l) => l.id !== layerId) }
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

/** Rotate a layer (degrees), around its centre — matching the renderer's rotation origin. */
export function setLayerRotation(composition: Composition, layerId: string, rotate: number): Composition {
  return updateLayer(composition, layerId, (l) => ({ ...l, rect: { ...l.rect, rotate } }))
}

/** Resize a layer's box (min 1px each side); position and rotation are untouched. */
export function setLayerSize(composition: Composition, layerId: string, w: number, h: number): Composition {
  return updateLayer(composition, layerId, (l) => ({ ...l, rect: { ...l.rect, w: Math.max(1, w), h: Math.max(1, h) } }))
}

/**
 * Patch a text layer's type properties from the property panel: literal size/weight/align overrides, and
 * colour re-bound to a brand role (so text stays on-brand and recolours with the kit). No-op elsewhere.
 */
export function updateTextStyle(
  composition: Composition,
  layerId: string,
  patch: { size?: number; weight?: number; align?: 'left' | 'center' | 'right'; colorRole?: ColorRole }
): Composition {
  return updateLayer(composition, layerId, (l) =>
    l.type !== 'text'
      ? l
      : {
          ...l,
          ...(patch.size !== undefined ? { size: lit(Math.max(1, patch.size)) } : {}),
          ...(patch.weight !== undefined ? { weight: lit(patch.weight) } : {}),
          ...(patch.align !== undefined ? { align: lit(patch.align) } : {}),
          ...(patch.colorRole !== undefined ? { color: boundColor(patch.colorRole) } : {}),
        }
  )
}

/** Set a plate layer's photo treatment (duotone/tint/grain/mono/none). No-op on non-plate layers. */
export function setPlateTreatment(composition: Composition, layerId: string, treatment: Treatment): Composition {
  return updateLayer(composition, layerId, (l) => (l.type === 'plate' ? { ...l, treatment: lit(treatment) } : l))
}

/** Point a plate layer at a new image (editor AI regenerate / reference / inpaint). No-op elsewhere. */
export function setPlateSrc(composition: Composition, layerId: string, src: string): Composition {
  return updateLayer(composition, layerId, (l) => (l.type === 'plate' ? { ...l, src } : l))
}

/** Re-bind a shape layer's fill to a brand colour role. No-op on non-shape layers. */
export function setShapeFillRole(composition: Composition, layerId: string, role: ColorRole): Composition {
  return updateLayer(composition, layerId, (l) => (l.type === 'shape' ? { ...l, fill: boundColor(role) } : l))
}

/** Set a numeric chrome param (e.g. strokeWidth, count, cols) as a literal. No-op on non-chrome layers. */
export function setChromeParam(composition: Composition, layerId: string, key: string, value: number): Composition {
  return updateLayer(composition, layerId, (l) => (l.type === 'chrome' ? { ...l, params: { ...l.params, [key]: lit(value) } } : l))
}

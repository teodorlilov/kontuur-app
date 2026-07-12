import type { Composition, Layer, Rect, VAnchor } from '@/lib/scene-graph'

/** The Instagram carousel ratios we support — all 1080 wide, differing only in height. */
export type AspectRatio = '1:1' | '4:5' | '4:3'

export const RATIO_SIZES: Record<AspectRatio, { w: number; h: number }> = {
  '1:1': { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
  '4:3': { w: 1080, h: 810 },
}

export const ASPECT_RATIOS = Object.keys(RATIO_SIZES) as AspectRatio[]
export const DEFAULT_RATIO: AspectRatio = '4:5'

/**
 * Reposition one layer's box for a new canvas height, per its vertical anchor. Width is identical
 * across the ratios, so only y/h move:
 * - `top` (default) — unchanged (fixed distance from the top).
 * - `bottom` — shifts by Δheight (fixed distance from the bottom).
 * - `center` — shifts by Δheight/2 (stays centred).
 * - `fill` — stretches to the full canvas (backgrounds/plates).
 * - `stretch` — keeps both insets (top y fixed, height grows by Δheight — an inset frame).
 */
export function resolveRect(rect: Rect, vAnchor: VAnchor | undefined, fromH: number, toH: number): Rect {
  if (fromH === toH) return rect
  const dh = toH - fromH
  switch (vAnchor) {
    case 'fill':
      return { ...rect, y: 0, h: toH }
    case 'bottom':
      return { ...rect, y: rect.y + dh }
    case 'center':
      return { ...rect, y: rect.y + dh / 2 }
    case 'stretch':
      return { ...rect, h: rect.h + dh }
    case 'top':
    default:
      return rect
  }
}

/**
 * Resolve a composition authored at one size to a target size by repositioning each layer per its
 * `vAnchor`. Returns the composition unchanged when sizes match (the common 4:5 case), so the default
 * path allocates nothing. Group children keep their in-group coordinates (packs are flat today).
 */
export function resolveComposition(composition: Composition, targetSize: { w: number; h: number }): Composition {
  if (composition.size.w === targetSize.w && composition.size.h === targetSize.h) return composition
  const fromH = composition.size.h
  const toH = targetSize.h
  return {
    ...composition,
    size: targetSize,
    layers: composition.layers.map((layer): Layer => ({ ...layer, rect: resolveRect(layer.rect, layer.vAnchor, fromH, toH) })),
  }
}

/**
 * Stamp vertical anchors onto a composition's layers by id — the authoring convenience the packs use to
 * declare, in one place, which layers ride the bottom / stay centred / fill / stretch across ratios.
 * Layers absent from the map keep the default `top`.
 */
export function applyVAnchors(composition: Composition, anchors: Record<string, VAnchor>): Composition {
  return {
    ...composition,
    layers: composition.layers.map((layer): Layer => (anchors[layer.id] ? { ...layer, vAnchor: anchors[layer.id] } : layer)),
  }
}

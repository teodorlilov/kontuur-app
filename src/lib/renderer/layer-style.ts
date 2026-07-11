import type { CSSProperties } from 'react'
import type { BrandTokens, Clip, Layer } from '@/lib/scene-graph'
import { resolve } from '@/lib/scene-graph'

export const SLIDE_W = 1080
export const SLIDE_H = 1350

/**
 * The absolute box + opacity + blend + clip shared by every layer. Position is absolute
 * in the 1080×1350 space (or within the nearest group); array order is paint order.
 */
export function baseLayerStyle(layer: Layer, tokens: BrandTokens): CSSProperties {
  const { x, y, w, h, rotate } = layer.rect
  return {
    position: 'absolute',
    left: x,
    top: y,
    width: w,
    height: h,
    transform: rotate ? `rotate(${rotate}deg)` : undefined,
    opacity: resolve<number>(layer.opacity, tokens),
    mixBlendMode: resolve(layer.blendMode, tokens),
    clipPath: clipPath(layer.clip),
    display: layer.hidden ? 'none' : undefined,
  }
}

function clipPath(clip: Clip): string | undefined {
  switch (clip.kind) {
    case 'rect':
      return clip.radius ? `inset(0 round ${clip.radius}px)` : undefined
    case 'ellipse':
      return 'ellipse(50% 50%)'
    case 'mark':
      // References an SVG <clipPath>; exercised once packs exist (Phase 2).
      return `url(#clip-${clip.packElementId})`
    case 'none':
    default:
      return undefined
  }
}

import type { BrandTokens, Composition } from '@/lib/scene-graph'
import { substituteRoleVars } from './colors'

/** Load one image URL into an HTMLImageElement, resolving null on error (a dead plate must not hang). */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

const svgDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/**
 * Preload every raster the composition needs — plate `src`s and mark SVGs (role vars → hex, as a data
 * URL) — keyed by layer id. The builder is synchronous once these are ready, so `toDataURL` never
 * captures a half-loaded image. Failed loads are simply absent (the plate falls back to its gradient).
 */
export async function loadCompositionImages(
  composition: Composition,
  tokens: BrandTokens,
  marks?: Record<string, string>
): Promise<Map<string, HTMLImageElement>> {
  const out = new Map<string, HTMLImageElement>()
  const tasks: Promise<void>[] = []
  for (const layer of composition.layers) {
    if (layer.type === 'plate' && layer.src) {
      tasks.push(loadImage(layer.src).then((img) => { if (img) out.set(layer.id, img) }))
    } else if (layer.type === 'mark') {
      // An operator-inserted vector carries its SVG inline; a pack mark is looked up by id.
      const svg = layer.svg ?? marks?.[layer.packElementId]
      if (svg) tasks.push(loadImage(svgDataUrl(substituteRoleVars(svg, tokens))).then((img) => { if (img) out.set(layer.id, img) }))
    }
  }
  await Promise.all(tasks)
  return out
}

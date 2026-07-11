import type { ColorRole } from '@/lib/scene-graph'
import { darken, mix, relativeLuminance, saturation, toHex, type Rgb } from './color'
import type { ColorCluster } from './kmeans'

/** Argmax over clusters by `score`, skipping already-chosen indices; returns the index or -1. */
function pickIndex(clusters: ColorCluster[], score: (c: ColorCluster) => number, used: Set<number>): number {
  let best = -1
  let bestScore = -Infinity
  clusters.forEach((c, i) => {
    if (used.has(i)) return
    const s = score(c)
    if (s > bestScore) {
      bestScore = s
      best = i
    }
  })
  return best
}

const at = (clusters: ColorCluster[], i: number, fallback: Rgb): Rgb => (i >= 0 ? (clusters[i]?.centroid ?? fallback) : fallback)

/**
 * Map a k-means palette to the five colour roles by luminance + saturation (§2.2 image path):
 * `surface` = the lightest prominent cluster, `ink` = the darkest prominent, `accent` = the most
 * saturated. Roles are picked distinct when there are enough clusters so a flat image doesn't collapse
 * them. `accent-deep` darkens the accent; `line` is a low-contrast tint of ink.
 */
export function paletteToRoles(clusters: ColorCluster[]): Record<ColorRole, string> {
  const used = new Set<number>()

  const surfaceIdx = pickIndex(clusters, (c) => c.weight * relativeLuminance(c.centroid), used)
  if (surfaceIdx >= 0) used.add(surfaceIdx)
  const inkIdx = pickIndex(clusters, (c) => c.weight * (1 - relativeLuminance(c.centroid)), used)
  if (inkIdx >= 0) used.add(inkIdx)
  const accentIdx = pickIndex(clusters, (c) => c.weight * saturation(c.centroid), used)

  const surface = at(clusters, surfaceIdx, { r: 255, g: 255, b: 255 })
  const ink = at(clusters, inkIdx, { r: 26, g: 26, b: 26 })
  const accent = at(clusters, accentIdx, { r: 37, g: 99, b: 235 })

  return {
    surface: toHex(surface),
    ink: toHex(ink),
    accent: toHex(accent),
    'accent-deep': toHex(darken(accent, 0.35)),
    line: toHex(mix(ink, surface, 0.85)),
  }
}

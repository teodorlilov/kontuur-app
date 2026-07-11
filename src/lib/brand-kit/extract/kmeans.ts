import type { Rgb } from './color'

export type WeightedColor = { rgb: Rgb; weight: number }
export type ColorCluster = { centroid: Rgb; weight: number }

const sqDist = (a: Rgb, b: Rgb): number => {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return dr * dr + dg * dg + db * db
}

const round = ({ r, g, b }: Rgb): Rgb => ({ r: Math.round(r), g: Math.round(g), b: Math.round(b) })

/** Deterministic maximin (farthest-point) seeding: heaviest colour first, then the colour maximising
 *  its weighted distance from the chosen set. No RNG, so clustering is stable across runs. */
function seedCentroids(points: WeightedColor[], k: number): Rgb[] {
  const heaviest = points.reduce((best, p) => (p.weight > best.weight ? p : best), points[0] as WeightedColor)
  const centroids: Rgb[] = [heaviest.rgb]
  while (centroids.length < k) {
    let bestPoint: WeightedColor | null = null
    let bestScore = -1
    for (const p of points) {
      let minD = Infinity
      for (const c of centroids) minD = Math.min(minD, sqDist(p.rgb, c))
      const score = minD * p.weight
      if (score > bestScore) {
        bestScore = score
        bestPoint = p
      }
    }
    if (!bestPoint) break
    centroids.push(bestPoint.rgb)
  }
  return centroids
}

function nearest(rgb: Rgb, centroids: Rgb[]): number {
  let best = 0
  let bestD = Infinity
  centroids.forEach((c, i) => {
    const d = sqDist(rgb, c)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/**
 * Weighted k-means over colours — the palette core of the image extractor (§2.2). `points` are colours
 * with a weight (pixel count or area); returns clusters sorted by weight (most dominant first). Pure and
 * deterministic; the image-decode-to-pixels step wraps it at the call site.
 */
export function kmeans(points: WeightedColor[], k: number, maxIterations = 20): ColorCluster[] {
  const valid = points.filter((p) => p.weight > 0)
  if (valid.length === 0) return []
  if (valid.length <= k) {
    return valid.map((p) => ({ centroid: round(p.rgb), weight: p.weight })).sort((a, b) => b.weight - a.weight)
  }

  let centroids = seedCentroids(valid, k)
  let assignment: number[] = valid.map((p) => nearest(p.rgb, centroids))

  for (let iter = 0; iter < maxIterations; iter++) {
    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, w: 0 }))
    valid.forEach((p, i) => {
      const a = assignment[i] ?? 0
      const acc = sums[a]
      if (!acc) return
      acc.r += p.rgb.r * p.weight
      acc.g += p.rgb.g * p.weight
      acc.b += p.rgb.b * p.weight
      acc.w += p.weight
    })
    const moved = centroids.map((c, i) => {
      const acc = sums[i]
      return acc && acc.w > 0 ? { r: acc.r / acc.w, g: acc.g / acc.w, b: acc.b / acc.w } : c
    })
    const next = valid.map((p) => nearest(p.rgb, moved))
    centroids = moved
    if (next.every((v, i) => v === assignment[i])) break
    assignment = next
  }

  const weights = centroids.map(() => 0)
  valid.forEach((p, i) => {
    const a = assignment[i] ?? 0
    weights[a] = (weights[a] ?? 0) + p.weight
  })
  return centroids
    .map((c, i) => ({ centroid: round(c), weight: weights[i] ?? 0 }))
    .filter((c) => c.weight > 0)
    .sort((a, b) => b.weight - a.weight)
}

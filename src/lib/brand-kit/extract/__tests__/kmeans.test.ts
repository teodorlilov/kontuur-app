import { describe, expect, it } from 'vitest'
import { kmeans, type WeightedColor } from '../kmeans'

const near = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, tol = 8) =>
  Math.abs(a.r - b.r) <= tol && Math.abs(a.g - b.g) <= tol && Math.abs(a.b - b.b) <= tol

describe('kmeans', () => {
  it('recovers three well-separated colour groups', () => {
    const points: WeightedColor[] = [
      { rgb: { r: 250, g: 250, b: 250 }, weight: 5 },
      { rgb: { r: 245, g: 248, b: 245 }, weight: 5 },
      { rgb: { r: 10, g: 10, b: 10 }, weight: 3 },
      { rgb: { r: 20, g: 15, b: 12 }, weight: 3 },
      { rgb: { r: 40, g: 100, b: 240 }, weight: 1 },
      { rgb: { r: 35, g: 95, b: 235 }, weight: 1 },
    ]
    const clusters = kmeans(points, 3)
    expect(clusters).toHaveLength(3)
    // sorted by weight: whitish group is heaviest
    expect(near(clusters[0]!.centroid, { r: 247, g: 249, b: 247 })).toBe(true)
    // a bluish cluster exists somewhere
    expect(clusters.some((c) => near(c.centroid, { r: 37, g: 97, b: 237 }))).toBe(true)
  })

  it('conserves total weight across clusters', () => {
    const points: WeightedColor[] = [
      { rgb: { r: 0, g: 0, b: 0 }, weight: 2 },
      { rgb: { r: 255, g: 255, b: 255 }, weight: 3 },
      { rgb: { r: 128, g: 0, b: 0 }, weight: 4 },
    ]
    const total = kmeans(points, 2).reduce((sum, c) => sum + c.weight, 0)
    expect(total).toBe(9)
  })

  it('returns one cluster per point when k exceeds the point count', () => {
    const points: WeightedColor[] = [
      { rgb: { r: 0, g: 0, b: 0 }, weight: 1 },
      { rgb: { r: 255, g: 255, b: 255 }, weight: 1 },
    ]
    expect(kmeans(points, 5)).toHaveLength(2)
  })

  it('is deterministic — same input, same output', () => {
    const points: WeightedColor[] = [
      { rgb: { r: 200, g: 30, b: 40 }, weight: 3 },
      { rgb: { r: 10, g: 200, b: 90 }, weight: 2 },
      { rgb: { r: 30, g: 40, b: 220 }, weight: 2 },
      { rgb: { r: 210, g: 25, b: 35 }, weight: 3 },
    ]
    expect(kmeans(points, 2)).toEqual(kmeans(points, 2))
  })
})

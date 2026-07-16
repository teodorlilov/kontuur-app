import { describe, expect, it } from 'vitest'
import { tornRectPoints } from '../torn'

describe('tornRectPoints', () => {
  it('is deterministic for a given seed (preview == export)', () => {
    expect(tornRectPoints(800, 600, 7)).toEqual(tornRectPoints(800, 600, 7))
  })

  it('differs across seeds', () => {
    expect(tornRectPoints(800, 600, 7)).not.toEqual(tornRectPoints(800, 600, 8))
  })

  it('returns an even-length, non-empty polygon within the jittered box', () => {
    const jitter = 14
    const pts = tornRectPoints(800, 600, 1, jitter, 40)
    expect(pts.length % 2).toBe(0)
    expect(pts.length).toBeGreaterThan(8) // several points per edge
    for (let i = 0; i < pts.length; i += 2) {
      expect(pts[i]!).toBeGreaterThanOrEqual(-jitter - 1)
      expect(pts[i]!).toBeLessThanOrEqual(800 + jitter + 1)
      expect(pts[i + 1]!).toBeGreaterThanOrEqual(-jitter - 1)
      expect(pts[i + 1]!).toBeLessThanOrEqual(600 + jitter + 1)
    }
  })
})

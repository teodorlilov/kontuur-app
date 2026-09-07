import { describe, expect, it } from 'vitest'
import { barWidthPct, MIN_VISIBLE_PCT } from '../compute/bar-scale'

/**
 * DESIGN.md:438 — "an empty state must never render larger than an occupied one. Height maps to
 * count, with a small fixed floor for zero." These pin both halves: the floor a real value gets,
 * and the zero that gets no length at all.
 */
describe('barWidthPct', () => {
  it('scales a value against its maximum, within the given span', () => {
    expect(barWidthPct(50, 100, 82)).toBeCloseTo(41)
    expect(barWidthPct(100, 100, 82)).toBeCloseTo(82)
  })

  /**
   * Both live shapes: the audience place lists (span 88), where a 0.4% country against a 62%
   * leader is 0.57% of the track, and the comparison rows (span 82), where 3 reached against a
   * 32,340 maximum is 0.008% of it.
   */
  it('floors a value too small to see rather than drawing nothing', () => {
    expect(barWidthPct(0.4, 62, 88)).toBe(MIN_VISIBLE_PCT)
    expect(barWidthPct(3, 32_340, 82)).toBe(MIN_VISIBLE_PCT)
  })

  it('gives a measured zero no length — each surface draws that its own way', () => {
    expect(barWidthPct(0, 100, 82)).toBe(0)
  })

  it('returns zero rather than Infinity when the maximum is unusable', () => {
    expect(barWidthPct(5, 0, 82)).toBe(0)
    expect(barWidthPct(0, 0, 82)).toBe(0)
  })

  /**
   * 78 is the smallest of the three spans (funnel-section); a floored bar must still read as
   * small against even that one.
   */
  it('never floors a value up past its own span', () => {
    expect(MIN_VISIBLE_PCT).toBeLessThan(78)
  })
})

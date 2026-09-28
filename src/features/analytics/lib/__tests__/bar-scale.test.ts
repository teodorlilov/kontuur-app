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

  it('floors a value too small to see rather than drawing nothing — the audience lists (span 88) and comparison rows (82)', () => {
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

  it('never floors a value up past its own span, even the smallest (78, funnel-section)', () => {
    expect(MIN_VISIBLE_PCT).toBeLessThan(78)
  })
})

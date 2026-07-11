import { describe, expect, it } from 'vitest'
import { computeFit } from '../autofit'

const opts = { startSize: 96, min: 40, scale: 1.25 }

describe('computeFit', () => {
  it('reports ok when the text fits at its starting size (no shrink)', () => {
    const outcome = computeFit(() => true, opts)
    expect(outcome).toEqual({ size: 96, steps: 0, fit: 'ok' })
  })

  it('shrinks one step and reports shrunk:1 for a slightly-too-long headline', () => {
    // Fits only at ≤ 80px; 96/1.25 = 76.8 fits after one step.
    const outcome = computeFit((size) => size <= 80, opts)
    expect(outcome.steps).toBe(1)
    expect(outcome.fit).toBe('shrunk:1')
    expect(outcome.size).toBeCloseTo(76.8)
  })

  it('reports overflow (without clipping) when it never fits, stopping at min', () => {
    const outcome = computeFit(() => false, opts)
    expect(outcome.fit).toBe('overflow')
    expect(outcome.size).toBe(40) // clamped to min, not below
  })

  it('never steps below min', () => {
    const outcome = computeFit((size) => size < 10, opts)
    expect(outcome.size).toBeGreaterThanOrEqual(opts.min)
  })
})

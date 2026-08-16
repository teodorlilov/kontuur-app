import { describe, expect, it } from 'vitest'
import { arcPointAt, clampBend, maxBend } from '../text-arc'

describe('arcPointAt', () => {
  it('is EXACTLY the identity at bend 0', () => {
    // toBe, not toBeCloseTo. The control passes through zero on the way to everywhere else, so a
    // near-miss here is a visible nudge every time the user drags across straight. If anyone
    // replaces the removable-singularity branches with a Taylor series, this must fail.
    for (const centre of [0, 12.5, 200, 999]) {
      const point = arcPointAt(centre, 1000, 0)
      expect(point.x).toBe(centre)
      expect(point.y).toBe(0)
      expect(point.angle).toBe(0)
    }
  })

  it('leaves the middle of the line where it was, at any bend', () => {
    for (const bend of [-1, -0.4, 0.25, 1]) {
      const point = arcPointAt(500, 1000, bend)
      expect(point.x).toBeCloseTo(500, 10)
      expect(point.y).toBeCloseTo(0, 10)
      expect(point.angle).toBeCloseTo(0, 10)
    }
  })

  it('mirrors exactly about the middle', () => {
    // Whatever the arc does to a glyph 200px left of centre it must do to one 200px right.
    const left = arcPointAt(300, 1000, 0.6)
    const right = arcPointAt(700, 1000, 0.6)
    expect(right.x - 500).toBeCloseTo(500 - left.x, 10)
    expect(right.y).toBeCloseTo(left.y, 10)
    expect(right.angle).toBeCloseTo(-left.angle, 10)
  })

  it('arches upward for a positive bend — ends below the middle, since +y is down', () => {
    const end = arcPointAt(1000, 1000, 0.5)
    const start = arcPointAt(0, 1000, 0.5)
    expect(end.y).toBeGreaterThan(0)
    expect(start.y).toBeGreaterThan(0)
  })

  it('flips with the sign of the bend', () => {
    expect(arcPointAt(1000, 1000, -0.5).y).toBeCloseTo(-arcPointAt(1000, 1000, 0.5).y, 10)
  })

  it('places the ends on the chord a half-turn subtends', () => {
    // At bend 1 the line sweeps π, so the chord is L·sin(π/2)/(π/2) = 2L/π — worked by hand.
    const end = arcPointAt(1000, 1000, 1)
    const start = arcPointAt(0, 1000, 1)
    expect(end.x - start.x).toBeCloseTo((2 * 1000) / Math.PI, 6)
    // And the end tangents are vertical: ±π/2.
    expect(end.angle).toBeCloseTo(Math.PI / 2, 10)
    expect(start.angle).toBeCloseTo(-Math.PI / 2, 10)
  })

  it('survives a zero-width line rather than dividing by it', () => {
    const point = arcPointAt(0, 0, 1)
    expect(Number.isFinite(point.x)).toBe(true)
    expect(Number.isFinite(point.y)).toBe(true)
    expect(point.angle).toBe(0)
  })
})

describe('maxBend', () => {
  it('lets a long line bend further than a short one', () => {
    expect(maxBend(1200, 96)).toBeGreaterThan(maxBend(300, 96))
  })

  it('never exceeds the control range', () => {
    expect(maxBend(100000, 24)).toBe(1)
  })

  it('is zero for a line with no width or no size', () => {
    expect(maxBend(0, 96)).toBe(0)
    expect(maxBend(500, 0)).toBe(0)
  })
})

describe('clampBend', () => {
  it('keeps the direction while limiting the amount', () => {
    // A three-character run cannot take a half turn — but it can still arch the way it was pushed.
    const limited = clampBend(-1, 150, 96)
    expect(limited).toBeLessThan(0)
    expect(limited).toBe(-maxBend(150, 96))
  })

  it('leaves a bend the line can carry alone', () => {
    expect(clampBend(0.2, 1200, 96)).toBe(0.2)
  })
})

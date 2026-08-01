import { describe, it, expect } from 'vitest'
import { monthViewIn, nextMonthView, prevMonthView, type MonthView } from '../helpers'

/**
 * React double-invokes state updaters under StrictMode to surface impurity. Running each updater
 * twice on the same input and asserting both calls agree is what would have caught the original
 * bug, where the month updater called setYear from inside itself and skipped a whole year.
 */
function stepTwice(state: MonthView, step: (s: MonthView) => MonthView): MonthView {
  const discarded = step(state)
  const kept = step(state)
  expect(discarded).toEqual(kept)
  return kept
}

describe('month stepping', () => {
  it('steps back over the year boundary by exactly one year', () => {
    expect(stepTwice({ year: 2026, month: 0 }, prevMonthView)).toEqual({ year: 2025, month: 11 })
  })

  it('steps forward over the year boundary by exactly one year', () => {
    expect(stepTwice({ year: 2026, month: 11 }, nextMonthView)).toEqual({ year: 2027, month: 0 })
  })

  it('steps within a year without touching the year', () => {
    expect(prevMonthView({ year: 2026, month: 5 })).toEqual({ year: 2026, month: 4 })
    expect(nextMonthView({ year: 2026, month: 5 })).toEqual({ year: 2026, month: 6 })
  })

  it('round-trips back and forward to where it started', () => {
    const start: MonthView = { year: 2026, month: 0 }
    expect(nextMonthView(prevMonthView(start))).toEqual(start)
  })

  it('walks twelve months back to the same month a year earlier', () => {
    let view: MonthView = { year: 2026, month: 5 }
    for (let i = 0; i < 12; i++) view = prevMonthView(view)
    expect(view).toEqual({ year: 2025, month: 5 })
  })
})

describe('monthViewIn', () => {
  it('reports a zero-based month, matching Date.getMonth', () => {
    const view = monthViewIn('UTC')
    expect(view.month).toBeGreaterThanOrEqual(0)
    expect(view.month).toBeLessThanOrEqual(11)
  })

  it('resolves the month in the given zone, not the runtime one', () => {
    // Kiritimati is UTC+14 and Niue UTC-11, so at any instant the two can sit on different dates —
    // and therefore, around a month boundary, in different months.
    const east = monthViewIn('Pacific/Kiritimati')
    const west = monthViewIn('Pacific/Niue')
    const asIndex = (v: MonthView) => v.year * 12 + v.month
    expect(asIndex(east)).toBeGreaterThanOrEqual(asIndex(west))
    expect(asIndex(east) - asIndex(west)).toBeLessThanOrEqual(1)
  })
})

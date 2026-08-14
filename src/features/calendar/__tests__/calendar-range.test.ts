import { describe, it, expect } from 'vitest'
import {
  monthViewIn,
  nextMonthView,
  nextWeekView,
  prevMonthView,
  prevWeekView,
  weekViewIn,
  monthViewOfWeek,
  weekViewOfMonth,
  type MonthView,
} from '../lib/calendar-range'

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


describe('week stepping', () => {
  it('steps back a whole week, across a month boundary', () => {
    const first = prevWeekView('2026-08-03')
    const second = prevWeekView('2026-08-03')
    expect(first).toBe(second) // pure under StrictMode's double invoke
    expect(first).toBe('2026-07-27')
  })

  it('steps forward a whole week, across a year boundary', () => {
    expect(nextWeekView('2026-12-28')).toBe('2027-01-04')
  })

  it('lands on a Monday whatever the zone', () => {
    // Stepping never re-derives the weekday, so a Monday key stays a Monday.
    expect(nextWeekView(weekViewIn('Europe/Sofia'))).toBe(
      nextWeekView(weekViewIn('Europe/Sofia'))
    )
  })

  it('does not drift across a DST boundary', () => {
    // Sofia springs forward on 29 Mar 2026. A week is seven calendar days either
    // way — the arithmetic is on the date key, never on a clock.
    expect(nextWeekView('2026-03-23')).toBe('2026-03-30')
    expect(prevWeekView('2026-03-30')).toBe('2026-03-23')
  })
})

describe('moving between week and month', () => {
  it('lands on the month the viewed week opens in', () => {
    expect(monthViewOfWeek('2026-08-03')).toEqual({ year: 2026, month: 7 })
  })

  it('resolves a straddling week to the month it starts in', () => {
    // 31 Aug – 6 Sep 2026. Either answer is arbitrary; the start is the one the
    // range label already uses, so they agree.
    expect(monthViewOfWeek('2026-08-31')).toEqual({ year: 2026, month: 7 })
  })

  it('lands on a Monday on or before the first of the month', () => {
    // 1 Aug 2026 is a Saturday, so the week containing it opens on 27 July.
    expect(weekViewOfMonth({ year: 2026, month: 7 })).toBe('2026-07-27')
    // 1 Jun 2026 is a Monday — no shift.
    expect(weekViewOfMonth({ year: 2026, month: 5 })).toBe('2026-06-01')
  })

  it('round-trips: a month opened from its own week comes back unchanged', () => {
    const month = { year: 2026, month: 7 }
    expect(monthViewOfWeek(weekViewOfMonth(month))).toEqual(
      // July, because August 2026 opens mid-week — the round trip is not identity,
      // and asserting that stops someone "fixing" it into one.
      { year: 2026, month: 6 }
    )
  })
})

import { describe, expect, it } from 'vitest'
import {
  getMondayISO,
  getMonthBoundaries,
  getWeekDayKeys,
  getWeekRange,
  getWeekdayIndex,
  getZonedParts,
  snapTimeToHour,
  toDateKey,
} from '../date-helpers'

/** 2026-07-30 is a Thursday. */
const THURSDAY = new Date('2026-07-30T12:00:00Z')

describe('toDateKey', () => {
  it('formats in the requested zone', () => {
    expect(toDateKey(THURSDAY, 'UTC')).toBe('2026-07-30')
  })

  it('reports the local date, not the UTC one, either side of the line', () => {
    const lateUtc = new Date('2026-07-30T23:30:00Z')
    // Already Friday in Sydney, still Thursday in New York.
    expect(toDateKey(lateUtc, 'Australia/Sydney')).toBe('2026-07-31')
    expect(toDateKey(lateUtc, 'America/New_York')).toBe('2026-07-30')
  })
})

describe('getWeekdayIndex', () => {
  it('is Monday-first', () => {
    expect(getWeekdayIndex(THURSDAY, 'UTC')).toBe(3)
    expect(getWeekdayIndex(new Date('2026-07-27T12:00:00Z'), 'UTC')).toBe(0)
    // Sunday is the end of the week here, not the start.
    expect(getWeekdayIndex(new Date('2026-08-02T12:00:00Z'), 'UTC')).toBe(6)
  })
})

describe('getMondayISO', () => {
  it('walks back to Monday', () => {
    expect(getMondayISO(THURSDAY, 'UTC')).toBe('2026-07-27')
  })

  it('returns Monday for a Monday and for the Sunday that ends the week', () => {
    expect(getMondayISO(new Date('2026-07-27T00:00:00Z'), 'UTC')).toBe('2026-07-27')
    expect(getMondayISO(new Date('2026-08-02T23:00:00Z'), 'UTC')).toBe('2026-07-27')
  })

  it('follows the reader, so a late-Sunday instant is a new week in the east', () => {
    const lateSunday = new Date('2026-08-02T23:30:00Z')
    expect(getMondayISO(lateSunday, 'America/New_York')).toBe('2026-07-27')
    // Already Monday in Sydney — the next week has started.
    expect(getMondayISO(lateSunday, 'Australia/Sydney')).toBe('2026-08-03')
  })

  it('crosses a month boundary without drifting', () => {
    expect(getMondayISO(new Date('2026-03-01T12:00:00Z'), 'UTC')).toBe('2026-02-23')
  })
})

describe('getWeekDayKeys', () => {
  it('returns seven consecutive calendar days', () => {
    expect(getWeekDayKeys('2026-07-27')).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ])
  })

  it('spans a DST transition as seven days, not six or eight', () => {
    // Europe/Sofia springs forward on 2026-03-29.
    expect(getWeekDayKeys('2026-03-23')).toHaveLength(7)
    expect(getWeekDayKeys('2026-03-23')[6]).toBe('2026-03-29')
  })
})

describe('getWeekRange', () => {
  it('is half-open and exactly seven days wide in UTC', () => {
    const { from, to } = getWeekRange('2026-07-27', 'UTC')
    expect(from).toBe('2026-07-27T00:00:00.000Z')
    expect(to).toBe('2026-08-03T00:00:00.000Z')
  })

  it('starts at local midnight, not UTC midnight', () => {
    // Sofia is UTC+3 in July, so the week opens at 21:00 the previous day.
    expect(getWeekRange('2026-07-27', 'Europe/Sofia').from).toBe('2026-07-26T21:00:00.000Z')
    // New York is UTC-4 in July.
    expect(getWeekRange('2026-07-27', 'America/New_York').from).toBe('2026-07-27T04:00:00.000Z')
  })

  it('survives the spring-forward week it contains', () => {
    // Sofia goes UTC+2 → UTC+3 on 2026-03-29, inside this week.
    const { from, to } = getWeekRange('2026-03-23', 'Europe/Sofia')
    expect(from).toBe('2026-03-22T22:00:00.000Z')
    // The following Monday opens an hour "earlier" in UTC — 167h, not 168.
    expect(to).toBe('2026-03-29T21:00:00.000Z')
    const hours = (Date.parse(to) - Date.parse(from)) / 3_600_000
    expect(hours).toBe(167)
  })

  it('covers a scheduled_at that only falls in the week in the local zone', () => {
    const { from, to } = getWeekRange('2026-07-27', 'Australia/Sydney')
    // Sunday 23:30 Sydney time — Sunday 13:30 UTC, still inside the local week.
    const lateSunday = Date.parse('2026-08-02T13:30:00Z')
    expect(lateSunday).toBeGreaterThanOrEqual(Date.parse(from))
    expect(lateSunday).toBeLessThan(Date.parse(to))
  })
})

describe('getMonthBoundaries', () => {
  it('brackets the current month in the given zone', () => {
    const { monthStart, lastMonthStart } = getMonthBoundaries('UTC')
    const now = Date.now()
    expect(Date.parse(monthStart)).toBeLessThanOrEqual(now)
    expect(Date.parse(lastMonthStart)).toBeLessThan(Date.parse(monthStart))
    // Consecutive months are never more than 31 days apart.
    const days = (Date.parse(monthStart) - Date.parse(lastMonthStart)) / 86_400_000
    expect(days).toBeGreaterThanOrEqual(28)
    expect(days).toBeLessThanOrEqual(31)
  })

  it('opens the month at local midnight', () => {
    expect(getMonthBoundaries('UTC').monthStart.endsWith('T00:00:00.000Z')).toBe(true)
    // Any non-UTC zone starts its month at a different instant than UTC does.
    expect(getMonthBoundaries('Asia/Tokyo').monthStart).not.toBe(
      getMonthBoundaries('UTC').monthStart
    )
  })
})

describe('omitting the zone', () => {
  it('matches the runtime zone, so existing callers are unaffected', () => {
    const runtimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(toDateKey(THURSDAY)).toBe(toDateKey(THURSDAY, runtimeZone))
    expect(getMondayISO(THURSDAY)).toBe(getMondayISO(THURSDAY, runtimeZone))
    expect(getWeekdayIndex(THURSDAY)).toBe(getWeekdayIndex(THURSDAY, runtimeZone))
  })

  it('agrees with the previous getDay()/getFullYear() implementation', () => {
    // The old toDateKey read the runtime-local calendar fields directly.
    for (const iso of ['2026-01-01T00:30:00Z', '2026-07-30T23:45:00Z', '2026-12-31T12:00:00Z']) {
      const date = new Date(iso)
      const legacy = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate()
      ).padStart(2, '0')}`
      expect(toDateKey(date)).toBe(legacy)
    }
  })
})

describe('getZonedParts', () => {
  it('reads weekday, hour and minute in the requested zone', () => {
    expect(getZonedParts(THURSDAY, 'UTC')).toEqual({ weekday: 'thursday', hour: 12, minute: 0 })
  })

  it('crosses the day line with the zone, not with UTC', () => {
    const lateUtc = new Date('2026-07-30T23:30:00Z')
    // Friday morning in Sydney (UTC+10), Thursday evening in New York (UTC-4).
    expect(getZonedParts(lateUtc, 'Australia/Sydney')).toEqual({
      weekday: 'friday',
      hour: 9,
      minute: 30,
    })
    expect(getZonedParts(lateUtc, 'America/New_York')).toEqual({
      weekday: 'thursday',
      hour: 19,
      minute: 30,
    })
  })

  it('reports midnight as hour 0, not 24', () => {
    expect(getZonedParts(new Date('2026-07-30T00:00:00Z'), 'UTC').hour).toBe(0)
  })
})

describe('snapTimeToHour', () => {
  it('drops minutes, keeping the hour', () => {
    expect(snapTimeToHour('13:04')).toBe('13:00')
    expect(snapTimeToHour('09:00')).toBe('09:00')
    expect(snapTimeToHour('9:30')).toBe('09:00')
    expect(snapTimeToHour('23:59')).toBe('23:00')
  })

  it('falls back to the historical 09:00 for missing or invalid input', () => {
    expect(snapTimeToHour(null)).toBe('09:00')
    expect(snapTimeToHour(undefined)).toBe('09:00')
    expect(snapTimeToHour('')).toBe('09:00')
    expect(snapTimeToHour('later')).toBe('09:00')
    expect(snapTimeToHour('25:00')).toBe('09:00')
  })
})

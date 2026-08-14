import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getNextDateForDay,
  getMondayISO,
  getMonthBoundaries,
  getWeekDayKeys,
  getWeekRange,
  getWeekdayIndex,
  getZonedParts,
  isoToDateTimeFields,
  formatScheduledAt,
  snapTimeToHour,
  toDateKey,
  zonedTimeToInstant,
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

describe('zonedTimeToInstant', () => {
  it('resolves a wall clock against the named zone, not the runtime one', () => {
    // Sofia is UTC+3 in August (EEST).
    expect(zonedTimeToInstant('2026-08-06', '10:00', 'Europe/Sofia').toISOString()).toBe(
      '2026-08-06T07:00:00.000Z'
    )
    // ...and UTC+2 in January (EET). Same wall clock, different instant.
    expect(zonedTimeToInstant('2026-01-06', '10:00', 'Europe/Sofia').toISOString()).toBe(
      '2026-01-06T08:00:00.000Z'
    )
  })

  it('handles a zone on the other side of UTC', () => {
    // New York is UTC-4 in August (EDT).
    expect(zonedTimeToInstant('2026-08-06', '09:00', 'America/New_York').toISOString()).toBe(
      '2026-08-06T13:00:00.000Z'
    )
  })

  it('resolves a nonexistent spring-forward wall clock forward past the transition', () => {
    // Sofia springs forward at 03:00 on 29 Mar 2026, so 03:30 local never happens.
    // Documented behaviour, not an accident: it lands at the first instant that does.
    expect(zonedTimeToInstant('2026-03-29', '03:30', 'Europe/Sofia').toISOString()).toBe(
      '2026-03-29T01:30:00.000Z'
    )
  })

  it('resolves an ambiguous fall-back wall clock to the second occurrence', () => {
    // Sofia falls back at 04:00 EEST on 25 Oct 2026, so 03:30 local happens twice:
    // once at 00:30Z (UTC+3) and again at 01:30Z (UTC+2). The second pass samples the
    // offset after the shift, so the later one wins. Asserted because either is
    // defensible and the choice must not drift.
    expect(zonedTimeToInstant('2026-10-25', '03:30', 'Europe/Sofia').toISOString()).toBe(
      '2026-10-25T01:30:00.000Z'
    )
  })

  it('falls back to the runtime zone when the zone is omitted', () => {
    expect(zonedTimeToInstant('2026-08-06', '18:00').toISOString()).toBe(
      new Date('2026-08-06T18:00:00').toISOString()
    )
  })
})

describe('formatScheduledAt', () => {
  it('is the ISO form of zonedTimeToInstant', () => {
    expect(formatScheduledAt('2026-08-06', '10:00', 'Europe/Sofia')).toBe(
      zonedTimeToInstant('2026-08-06', '10:00', 'Europe/Sofia').toISOString()
    )
  })

  it('defaults an empty time to noon', () => {
    expect(formatScheduledAt('2026-08-06', '', 'Europe/Sofia')).toBe(
      formatScheduledAt('2026-08-06', '12:00', 'Europe/Sofia')
    )
  })

  /**
   * The regression guard for the four callers that predate agency timezones
   * (slot-picker, schedule-dialog ×2, use-batch-schedule). Omitting the zone must
   * reproduce the old bare-string parse byte for byte, or this refactor silently
   * moves every scheduled post in the app.
   */
})

describe('isoToDateTimeFields', () => {
  it('splits an ISO instant into the form pair, in the given zone', () => {
    expect(isoToDateTimeFields('2026-08-06T07:00:00.000Z', 'Europe/Sofia')).toEqual({
      date: '2026-08-06',
      time: '10:00',
    })
  })

  it('round-trips with formatScheduledAt', () => {
    const iso = formatScheduledAt('2026-08-06', '10:00', 'Europe/Sofia')
    expect(isoToDateTimeFields(iso, 'Europe/Sofia')).toEqual({ date: '2026-08-06', time: '10:00' })
  })

  it('reports the zoned day, not the UTC one, either side of midnight', () => {
    // 22:30 UTC on the 6th is 01:30 on the 7th in Sofia.
    expect(isoToDateTimeFields('2026-08-06T22:30:00.000Z', 'Europe/Sofia')).toEqual({
      date: '2026-08-07',
      time: '01:30',
    })
  })
})

/**
 * The helper that turns "Monday" into a date, and the last place in the app that read a
 * weekday off the browser. Its answer becomes a `scheduled_at`, so a zone-blind reading
 * put approved posts on the wrong day for any operator whose machine disagreed with
 * their agency.
 */
describe('getNextDateForDay', () => {
  afterEach(() => vi.useRealTimers())
  const SOFIA = 'Europe/Sofia'
  const LA = 'America/Los_Angeles'

  it('finds the next occurrence of a weekday', () => {
    // 2026-08-14 is a Friday in Sofia.
    vi.useFakeTimers().setSystemTime(new Date('2026-08-14T09:00:00.000Z'))
    expect(getNextDateForDay('Monday', SOFIA)).toBe('2026-08-17')
    expect(getNextDateForDay('Saturday', SOFIA)).toBe('2026-08-15')
  })

  it('skips a week rather than returning today', () => {
    // "Next Friday" on a Friday is the one after, not this morning — a date already
    // past would be written as a schedule nobody could meet.
    vi.useFakeTimers().setSystemTime(new Date('2026-08-14T09:00:00.000Z'))
    expect(getNextDateForDay('Friday', SOFIA)).toBe('2026-08-21')
  })

  it('answers in the agency zone, not the runtime', () => {
    // 2026-08-15T04:00Z is Saturday 07:00 in Sofia and still Friday 21:00 in Los
    // Angeles. The next Monday is the same date, but the two zones disagree about what
    // day it is *now*, which is what the old `Date.getDay()` read.
    vi.useFakeTimers().setSystemTime(new Date('2026-08-15T04:00:00.000Z'))
    expect(getNextDateForDay('Sunday', SOFIA)).toBe('2026-08-16')
    // Friday in LA, so the next Sunday is still the 16th — but reached by a different
    // count, and a Saturday query proves the two really do differ.
    expect(getNextDateForDay('Saturday', SOFIA)).toBe('2026-08-22')
    expect(getNextDateForDay('Saturday', LA)).toBe('2026-08-15')
  })

  it('returns empty for a name that is not a weekday', () => {
    expect(getNextDateForDay('Someday', SOFIA)).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { moveScheduledToDay, shiftScheduledByDays } from '../lib/move-post'
import { formatScheduledAt, isoToDateTimeFields } from '@/utils/date-helpers'

const SOFIA = 'Europe/Sofia'
const NEW_YORK = 'America/New_York'

/** What the agency sees on the card, which is what "keeping the time" means. */
function wallClock(iso: string, zone: string): string {
  const { date, time } = isoToDateTimeFields(iso, zone)
  return `${date} ${time}`
}

describe('shiftScheduledByDays', () => {
  it('moves a day forward and keeps the time', () => {
    const from = formatIn('2026-08-12', '09:30', SOFIA)
    expect(wallClock(shiftScheduledByDays(from, 1, SOFIA), SOFIA)).toBe('2026-08-13 09:30')
  })

  it('moves a day back and keeps the time', () => {
    const from = formatIn('2026-08-12', '09:30', SOFIA)
    expect(wallClock(shiftScheduledByDays(from, -1, SOFIA), SOFIA)).toBe('2026-08-11 09:30')
  })

  it('crosses a month boundary', () => {
    const from = formatIn('2026-08-31', '18:00', SOFIA)
    expect(wallClock(shiftScheduledByDays(from, 1, SOFIA), SOFIA)).toBe('2026-09-01 18:00')
  })

  it('crosses a year boundary backwards', () => {
    const from = formatIn('2027-01-01', '07:00', SOFIA)
    expect(wallClock(shiftScheduledByDays(from, -1, SOFIA), SOFIA)).toBe('2026-12-31 07:00')
  })

  it('shifts a whole week in one call', () => {
    // The same command serves the keyboard's single day and a bulk ±N-day move.
    const from = formatIn('2026-08-12', '12:15', SOFIA)
    expect(wallClock(shiftScheduledByDays(from, 7, SOFIA), SOFIA)).toBe('2026-08-19 12:15')
  })

  describe('across a DST boundary', () => {
    it('keeps the wall clock over Sofia’s autumn fall-back', () => {
      // 2026-10-25 is the transition. A naive `+86_400_000ms` lands on 08:00 here,
      // because that Sunday is 25 hours long.
      const from = formatIn('2026-10-24', '09:00', SOFIA)
      expect(wallClock(shiftScheduledByDays(from, 2, SOFIA), SOFIA)).toBe('2026-10-26 09:00')
    })

    it('keeps the wall clock over Sofia’s spring forward', () => {
      // 2026-03-29, a 23-hour day: naive arithmetic lands on 10:00.
      const from = formatIn('2026-03-28', '09:00', SOFIA)
      expect(wallClock(shiftScheduledByDays(from, 2, SOFIA), SOFIA)).toBe('2026-03-30 09:00')
    })

    it('does the same in a western zone', () => {
      // 2026-11-01 is the US fall-back — a different date from Europe's, which is why
      // the zone has to be the agency's and not the runtime's.
      const from = formatIn('2026-10-31', '14:45', NEW_YORK)
      expect(wallClock(shiftScheduledByDays(from, 2, NEW_YORK), NEW_YORK)).toBe('2026-11-02 14:45')
    })

    it('is not a no-op — the instant really moves', () => {
      // Guards against a "fix" that returned the input: every assertion above compares
      // wall clocks, which a broken implementation could satisfy by doing nothing.
      const from = formatIn('2026-10-24', '09:00', SOFIA)
      expect(shiftScheduledByDays(from, 2, SOFIA)).not.toBe(from)
    })
  })

  it('returns an instant, not a wall-clock string', () => {
    const from = formatIn('2026-08-12', '09:30', SOFIA)
    // Sofia is UTC+3 in August, so 09:30 local is 06:30Z.
    expect(shiftScheduledByDays(from, 0, SOFIA)).toBe('2026-08-12T06:30:00.000Z')
  })
})

describe('moveScheduledToDay', () => {
  it('lands on the named day and keeps the time', () => {
    const from = formatIn('2026-08-12', '09:30', SOFIA)
    expect(wallClock(moveScheduledToDay(from, '2026-08-15', SOFIA), SOFIA)).toBe('2026-08-15 09:30')
  })

  it('keeps the time when the drop crosses a DST boundary', () => {
    // The relative and absolute forms must agree about the hour, or a dropped post and
    // a nudged one end up on the same day at different times.
    const from = formatIn('2026-10-24', '09:00', SOFIA)
    expect(moveScheduledToDay(from, '2026-10-26', SOFIA)).toBe(shiftScheduledByDays(from, 2, SOFIA))
  })

  it('is a no-op when the target is the day it is already on', () => {
    // What a drop back onto the source column produces. The caller skips the write, but
    // the arithmetic has to agree that nothing changed.
    const from = formatIn('2026-08-12', '09:30', SOFIA)
    expect(moveScheduledToDay(from, '2026-08-12', SOFIA)).toBe(from)
  })

  it('resolves the target day in the agency zone, not the runtime', () => {
    // 09:00 in New York is 13:00Z that day; a UTC reading of the target key would put
    // the post on the day before.
    const from = formatIn('2026-08-12', '09:00', NEW_YORK)
    expect(wallClock(moveScheduledToDay(from, '2026-08-13', NEW_YORK), NEW_YORK)).toBe(
      '2026-08-13 09:00'
    )
  })
})

/** The same helper every write path uses, so the fixtures are built the way rows are. */
function formatIn(date: string, time: string, zone: string): string {
  return formatScheduledAt(date, time, zone)
}

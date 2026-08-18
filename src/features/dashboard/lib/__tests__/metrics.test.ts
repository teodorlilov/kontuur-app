import { describe, expect, it } from 'vitest'
import { formatPublishSlot } from '../metrics'

/** 2026-07-30 is a Thursday. */
const NOW = new Date('2026-07-30T12:00:00Z')
const SOFIA = 'Europe/Sofia'

describe('formatPublishSlot', () => {
  it('labels the agency\'s own today as "Today", not the server\'s', () => {
    // 22:30 UTC is already the 31st in Sofia (UTC+3), so a server-local
    // comparison would wrongly call this today.
    const result = formatPublishSlot('2026-07-30T22:30:00Z', SOFIA, NOW)
    expect(result.isToday).toBe(false)
    expect(result.label).toBe('Fri 01:30')
  })

  it('marks a slot later the same agency-day as today', () => {
    const result = formatPublishSlot('2026-07-30T15:00:00Z', SOFIA, NOW)
    expect(result).toEqual({ label: 'Today 18:00', isToday: true })
  })

  it('renders time in the agency zone, not UTC', () => {
    expect(formatPublishSlot('2026-07-31T06:00:00Z', SOFIA, NOW).label).toBe('Fri 09:00')
    expect(formatPublishSlot('2026-07-31T06:00:00Z', 'UTC', NOW).label).toBe('Fri 06:00')
  })

  it('uses 24-hour time so 13:00 never reads as 1:00', () => {
    expect(formatPublishSlot('2026-07-31T10:00:00Z', SOFIA, NOW).label).toBe('Fri 13:00')
  })

  it('switches to a date once a weekday would be ambiguous', () => {
    // Within the horizon: a weekday still means "the next one".
    expect(formatPublishSlot('2026-08-04T09:00:00Z', SOFIA, NOW).label).toBe('Tue 12:00')
    // Beyond it, "Tue" could be either week, so the date carries it instead.
    expect(formatPublishSlot('2026-08-11T09:00:00Z', SOFIA, NOW).label).toBe('11 Aug 12:00')
  })

  it('pads single-digit hours so the column stays aligned', () => {
    expect(formatPublishSlot('2026-07-31T04:05:00Z', SOFIA, NOW).label).toBe('Fri 07:05')
  })
})

describe('the slot label the schedule dialog shows', () => {
  it('reads in the agency zone, not the viewer\'s', () => {
    // `ScheduleDialog` takes `timeZone` as a REQUIRED prop, with a comment explaining that resolving
    // a slot in the browser's zone silently scheduled posts at the wrong instant — and then labelled
    // that slot with a local `toLocaleTimeString`, no zone passed. So the dialog wrote 09:00 Sofia
    // and told an operator in London it was 07:00. Both halves speak the agency's zone now.
    // Late enough that the zone decides the DAY, not just the hour — which is the shape of the bug.
    const iso = '2026-07-31T22:00:00Z'
    expect(formatPublishSlot(iso, SOFIA, NOW).label).toBe('Sat 01:00')
    expect(formatPublishSlot(iso, 'Europe/London', NOW).label).toBe('Fri 23:00')
  })
})

import { describe, expect, it } from 'vitest'
import { getScheduleDue } from '../helpers'

const schedule = (day: string, time: string | null) => ({
  id: 's1',
  client_id: 'c1',
  is_active: true,
  frequency_value: 2,
  auto_generate_day: day,
  auto_generate_time: time,
})

/** 2026-08-04 is a Tuesday. */
const TUE_17_30_UTC = new Date('2026-08-04T17:30:00Z')

describe('getScheduleDue', () => {
  it('is due once the configured hour has passed on the configured day', () => {
    expect(getScheduleDue(schedule('tuesday', '17:00'), 'UTC', TUE_17_30_UTC).due).toBe(true)
  })

  it('is not due before the hour, or on another day', () => {
    const beforeSlot = new Date('2026-08-04T16:59:00Z')
    expect(getScheduleDue(schedule('tuesday', '17:00'), 'UTC', beforeSlot).due).toBe(false)
    expect(getScheduleDue(schedule('wednesday', '17:00'), 'UTC', TUE_17_30_UTC).due).toBe(false)
  })

  it('stays due for the rest of the local day, so a failed tick retries', () => {
    const lateEvening = new Date('2026-08-04T23:30:00Z')
    expect(getScheduleDue(schedule('tuesday', '17:00'), 'UTC', lateEvening).due).toBe(true)
  })

  it('evaluates day and hour in the agency zone, not UTC', () => {
    // 14:05 UTC is 17:05 in Sofia (UTC+3 in summer) — due there, not in UTC.
    const afternoon = new Date('2026-08-04T14:05:00Z')
    expect(getScheduleDue(schedule('tuesday', '17:00'), 'Europe/Sofia', afternoon).due).toBe(true)
    expect(getScheduleDue(schedule('tuesday', '17:00'), 'UTC', afternoon).due).toBe(false)
  })

  it('anchors scheduledAt at the top of the slot hour in the zone', () => {
    const { scheduledAt } = getScheduleDue(schedule('tuesday', '17:00'), 'UTC', TUE_17_30_UTC)
    expect(scheduledAt.toISOString()).toBe('2026-08-04T17:00:00.000Z')
    const sofia = getScheduleDue(
      schedule('tuesday', '17:00'),
      'Europe/Sofia',
      new Date('2026-08-04T15:45:00Z')
    )
    // Sofia's 17:00 slot is 14:00 UTC.
    expect(sofia.scheduledAt.toISOString()).toBe('2026-08-04T14:00:00.000Z')
  })

  it('reports the local hour, for scarce-retry-first ordering', () => {
    expect(getScheduleDue(schedule('tuesday', '17:00'), 'UTC', TUE_17_30_UTC).localHour).toBe(17)
    // 15:45 UTC is 18:45 in Sofia (UTC+3 in summer).
    expect(
      getScheduleDue(schedule('tuesday', '17:00'), 'Europe/Sofia', new Date('2026-08-04T15:45:00Z'))
        .localHour
    ).toBe(18)
  })

  it('ignores minutes in a stored time — slots are whole hours', () => {
    const topOfHour = new Date('2026-08-04T13:00:00Z')
    expect(getScheduleDue(schedule('tuesday', '13:04'), 'UTC', topOfHour).due).toBe(true)
  })

  it('falls back to the historical 09:00 slot when no time is stored', () => {
    const nine = new Date('2026-08-04T09:00:00Z')
    const eight = new Date('2026-08-04T08:59:00Z')
    expect(getScheduleDue(schedule('tuesday', null), 'UTC', nine).due).toBe(true)
    expect(getScheduleDue(schedule('tuesday', null), 'UTC', eight).due).toBe(false)
  })

  it('matches the day case-insensitively, as the old check did', () => {
    expect(getScheduleDue(schedule('Tuesday', '17:00'), 'UTC', TUE_17_30_UTC).due).toBe(true)
  })
})

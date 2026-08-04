import { describe, it, expect } from 'vitest'
import { isoToDateTimeFields, pickNextOpenSlot } from '../slot-picker'
import type { BestTimePlatform } from '@/types/api'

// Tuesday 4 Aug 2026, 12:00 local.
const now = new Date('2026-08-04T12:00:00')

const window = { time: '18:00', label: 'evening', reason: 'peak engagement' }

const bestTimes: BestTimePlatform[] = [
  {
    platform: 'Instagram',
    best_days: ['Thursday', 'Friday'],
    best_time_windows: [window],
    avoid: 'mornings',
    confidence: 'ai-derived',
    reasoning_summary: 'evening peak',
  },
]

function pick(overrides: Partial<Parameters<typeof pickNextOpenSlot>[0]> = {}) {
  return pickNextOpenSlot({
    platform: 'Instagram',
    bestTimes,
    postsPerWeek: 3,
    occupiedSlots: [],
    now,
    ...overrides,
  })
}

describe('pickNextOpenSlot', () => {
  it('picks the earliest upcoming best-time slot', () => {
    // Thursday 6 Aug beats Friday 7 Aug.
    expect(pick()).toBe(new Date('2026-08-06T18:00:00').toISOString())
  })

  it('skips a day the client already posts', () => {
    expect(pick({ occupiedSlots: [new Date('2026-08-06T09:00:00').toISOString()] })).toBe(
      new Date('2026-08-07T18:00:00').toISOString()
    )
  })

  it('rolls to next week when this week hits the posts-per-week target', () => {
    const occupied = [
      new Date('2026-08-03T09:00:00').toISOString(),
      new Date('2026-08-04T09:00:00').toISOString(),
      new Date('2026-08-05T09:00:00').toISOString(),
    ]
    expect(pick({ postsPerWeek: 3, occupiedSlots: occupied })).toBe(
      new Date('2026-08-13T18:00:00').toISOString()
    )
  })

  it('a zero target means no weekly cap', () => {
    const occupied = [new Date('2026-08-03T09:00:00').toISOString()]
    expect(pick({ postsPerWeek: 0, occupiedSlots: occupied })).toBe(
      new Date('2026-08-06T18:00:00').toISOString()
    )
  })

  it('a same-day slot still counts while its time is ahead', () => {
    const tuesdayTimes: BestTimePlatform[] = [{ ...bestTimes[0]!, best_days: ['Tuesday'] }]
    expect(pick({ bestTimes: tuesdayTimes })).toBe(new Date('2026-08-04T18:00:00').toISOString())
  })

  it('returns null without best-time data for the platform', () => {
    expect(pick({ bestTimes: null })).toBeNull()
    expect(pick({ platform: 'LinkedIn' })).toBeNull()
    expect(pick({ platform: null })).toBeNull()
  })
})

describe('isoToDateTimeFields', () => {
  it('splits an ISO slot into the form pair, local time', () => {
    const iso = new Date('2026-08-06T18:00:00').toISOString()
    expect(isoToDateTimeFields(iso)).toEqual({ date: '2026-08-06', time: '18:00' })
  })
})

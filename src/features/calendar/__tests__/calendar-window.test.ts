import { describe, expect, it } from 'vitest'
import {
  WINDOW_WEEKS_BACK,
  WINDOW_WEEKS_FORWARD,
  getCalendarWindow,
  mondayOfKey,
} from '@/features/calendar/lib/calendar-window'

describe('mondayOfKey', () => {
  it('snaps any weekday to the Monday of its week', () => {
    expect(mondayOfKey('2026-08-19')).toBe('2026-08-17') // Wednesday
    expect(mondayOfKey('2026-08-23')).toBe('2026-08-17') // Sunday
  })

  it('is a fixed point on Mondays', () => {
    expect(mondayOfKey('2026-08-17')).toBe('2026-08-17')
  })
})

describe('getCalendarWindow', () => {
  const window = getCalendarWindow('2026-08-17', 'Europe/Sofia')

  it('spans the configured weeks, Monday start to Sunday end', () => {
    expect(window.startKey).toBe('2026-06-22') // 8 weeks back, a Monday
    expect(window.endKey).toBe('2026-11-15') // 12 weeks forward, a Sunday
  })

  it('covers exactly back + anchor + forward whole weeks', () => {
    const days =
      (Date.parse(`${window.endKey}T00:00:00Z`) - Date.parse(`${window.startKey}T00:00:00Z`)) /
        86_400_000 +
      1
    expect(days).toBe((WINDOW_WEEKS_BACK + 1 + WINDOW_WEEKS_FORWARD) * 7)
  })

  it('derives query instants from the agency zone, DST included', () => {
    // June in Sofia is UTC+3, November is UTC+2 — the bounds must follow.
    expect(window.from).toBe('2026-06-21T21:00:00.000Z')
    expect(window.to).toBe('2026-11-15T22:00:00.000Z')
  })
})

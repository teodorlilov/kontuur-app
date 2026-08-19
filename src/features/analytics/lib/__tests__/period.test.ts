import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { periodDayKeys, resolvePeriod } from '../period'

describe('resolvePeriod', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 2026-08-19 noon UTC — "yesterday" is 2026-08-18 in UTC.
    vi.setSystemTime(new Date('2026-08-19T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('defaults to a 30-day window ending yesterday', () => {
    const period = resolvePeriod({}, 'UTC')
    expect(period).toEqual({
      preset: '30d',
      start: '2026-07-20',
      end: '2026-08-18',
      prevStart: '2026-06-20',
      prevEnd: '2026-07-19',
      days: 30,
    })
  })

  it('honors the 7d preset with a back-to-back previous window', () => {
    const period = resolvePeriod({ range: '7d' }, 'UTC')
    expect(period.start).toBe('2026-08-12')
    expect(period.end).toBe('2026-08-18')
    expect(period.prevEnd).toBe('2026-08-11')
    expect(period.prevStart).toBe('2026-08-05')
    expect(period.days).toBe(7)
  })

  it('rejects an unknown preset back to the default', () => {
    expect(resolvePeriod({ range: '365d' }, 'UTC').preset).toBe('30d')
    expect(resolvePeriod({ range: ['7d', '90d'] }, 'UTC').preset).toBe('30d')
  })

  it('accepts a valid custom range and mirrors its length backwards', () => {
    const period = resolvePeriod({ from: '2026-08-01', to: '2026-08-10' }, 'UTC')
    expect(period).toMatchObject({
      preset: 'custom',
      start: '2026-08-01',
      end: '2026-08-10',
      prevStart: '2026-07-22',
      prevEnd: '2026-07-31',
      days: 10,
    })
  })

  it('clamps a custom end into the future back to yesterday', () => {
    const period = resolvePeriod({ from: '2026-08-01', to: '2026-09-30' }, 'UTC')
    expect(period.end).toBe('2026-08-18')
    expect(period.preset).toBe('custom')
  })

  it('falls back to the preset on malformed or inverted custom bounds', () => {
    expect(resolvePeriod({ from: 'nope', to: '2026-08-10' }, 'UTC').preset).toBe('30d')
    expect(resolvePeriod({ from: '2026-08-10', to: '2026-08-01' }, 'UTC').preset).toBe('30d')
    // Longer than a year is a typo, not a report.
    expect(resolvePeriod({ from: '2020-01-01', to: '2026-08-01' }, 'UTC').preset).toBe('30d')
  })

  it('resolves yesterday in the agency timezone, not UTC', () => {
    // 2026-08-19 01:00 UTC is still 2026-08-18 in Los Angeles → yesterday there is the 17th.
    vi.setSystemTime(new Date('2026-08-19T01:00:00Z'))
    expect(resolvePeriod({}, 'America/Los_Angeles').end).toBe('2026-08-17')
    expect(resolvePeriod({}, 'UTC').end).toBe('2026-08-18')
  })
})

describe('periodDayKeys', () => {
  it('lists every day of the window in order', () => {
    const keys = periodDayKeys('2026-08-15', 4)
    expect(keys).toEqual(['2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18'])
  })
})

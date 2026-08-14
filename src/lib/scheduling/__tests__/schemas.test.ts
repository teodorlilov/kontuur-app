import { describe, expect, it } from 'vitest'
import { parseBestTimes } from '../schemas'

const valid = [
  {
    platform: 'Instagram',
    best_days: ['Thursday'],
    best_time_windows: [{ time: '18:00', label: 'evening', reason: 'peak' }],
    avoid: 'mornings',
    confidence: 'ai-derived',
    reasoning_summary: 'evening peak',
  },
]

describe('parseBestTimes', () => {
  it('accepts a well-formed blob', () => {
    expect(parseBestTimes(valid)).toHaveLength(1)
  })

  it('returns null for anything unusable rather than throwing', () => {
    // The grid draws nothing for these; it must not take the page down.
    expect(parseBestTimes(null)).toBeNull()
    expect(parseBestTimes({ platforms: 'nonsense' })).toBeNull()
    expect(parseBestTimes([])).toBeNull()
    expect(parseBestTimes([{ platform: 'Instagram' }])).toBeNull()
    expect(parseBestTimes('a string')).toBeNull()
  })

  it('rejects a window whose time is not HH:MM', () => {
    // formatScheduledAt would build an Invalid Date from '6pm' and throw on toISOString.
    expect(
      parseBestTimes([{ ...valid[0], best_time_windows: [{ time: '6pm' }] }])
    ).toBeNull()
  })

  it('tolerates a confidence the model invented', () => {
    // It is never read, and the model has returned values outside its own enum.
    expect(parseBestTimes([{ ...valid[0], confidence: 'very-sure' }])).toHaveLength(1)
  })

  it('accepts an entry with no days yet — the picker treats it as no suggestion', () => {
    expect(parseBestTimes([{ ...valid[0], best_days: [] }])).toHaveLength(1)
  })
})

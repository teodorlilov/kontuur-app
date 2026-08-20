import { describe, expect, it } from 'vitest'
import type { AudienceOnline } from '../build-report'
import { bestTimeFromOnline } from '../derive-best-time'

function emptyGrid(): number[][] {
  return Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
}

describe('bestTimeFromOnline', () => {
  it('derives days and windows from the observed grid, labeled as observed', () => {
    const grid = emptyGrid()
    grid[1]![21] = 300 // Tue 21:00
    grid[2]![20] = 250 // Wed 20:00
    grid[6]![21] = 200 // Sun 21:00
    const online: AudienceOnline = {
      grid,
      sampleDays: 12,
      peaks: [
        { weekday: 1, hour: 21, avg: 300 },
        { weekday: 2, hour: 20, avg: 250 },
        { weekday: 6, hour: 21, avg: 200 },
      ],
    }

    const result = bestTimeFromOnline(online)
    const entry = result.platforms[0]!
    expect(entry.platform).toBe('Instagram')
    // Full weekday names — suggestWeekSlots matches them lowercased.
    expect(entry.best_days).toEqual(['Tuesday', 'Wednesday', 'Sunday'])
    expect(entry.best_time_windows.map((window) => window.time)).toEqual(['21:00', '20:00'])
    expect(entry.confidence).toBe('observed')
    expect(entry.reasoning_summary).toContain('12 days')
    // Every window names its evidence.
    expect(entry.best_time_windows[0]!.reason).toContain('followers online')
  })

  it('never emits silent days or hours — zeros stay out of the pattern', () => {
    const grid = emptyGrid()
    grid[4]![9] = 80
    const online: AudienceOnline = {
      grid,
      sampleDays: 6,
      peaks: [{ weekday: 4, hour: 9, avg: 80 }],
    }
    const entry = bestTimeFromOnline(online).platforms[0]!
    expect(entry.best_days).toEqual(['Friday'])
    expect(entry.best_time_windows).toHaveLength(1)
  })
})

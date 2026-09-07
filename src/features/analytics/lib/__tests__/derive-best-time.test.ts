import { describe, expect, it } from 'vitest'
import type { AudienceOnline } from '../instagram/build-report'
import { bestTimeFromOnline } from '../instagram/derive-best-time'

function emptyGrid(): number[][] {
  return Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
}

describe('bestTimeFromOnline', () => {
  /**
   * The grid is Monday-first, so rows 1, 2 and 6 are Tuesday, Wednesday and Sunday. Days come
   * out as full names because slot-picker.ts matches `best_days` lowercased against its own
   * list, and every window names the evidence behind it.
   */
  it('derives days and windows from the observed grid, labeled as observed', () => {
    const grid = emptyGrid()
    grid[1]![21] = 300
    grid[2]![20] = 250
    grid[6]![21] = 200
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
    expect(entry.best_days).toEqual(['Tuesday', 'Wednesday', 'Sunday'])
    expect(entry.best_time_windows.map((window) => window.time)).toEqual(['21:00', '20:00'])
    expect(entry.confidence).toBe('observed')
    expect(entry.reasoning_summary).toContain('12 days')
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

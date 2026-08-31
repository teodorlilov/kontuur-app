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
    expect(parseBestTimes([{ ...valid[0], best_time_windows: [{ time: '6pm' }] }])).toBeNull()
  })

  it('tolerates a confidence the model invented', () => {
    // It is never read, and the model has returned values outside its own enum.
    expect(parseBestTimes([{ ...valid[0], confidence: 'very-sure' }])).toHaveLength(1)
  })

  it('accepts an entry with no days yet — the picker treats it as no suggestion', () => {
    expect(parseBestTimes([{ ...valid[0], best_days: [] }])).toHaveLength(1)
  })
})

describe('the parsed type is the stored type', () => {
  it('carries a row whose whole optional tail is absent', () => {
    // The defect this replaced: `types/api.ts` declared avoid/confidence/reasoning_summary and the
    // windows' label/reason REQUIRED, the schema declared them optional, and `parseBestTimes` closed
    // the gap with a bare `as`. A row like this one parses, and eight consumers were typed as if
    // every one of those fields were certainly present.
    const bare = [
      { platform: 'Instagram', best_days: ['Thursday'], best_time_windows: [{ time: '18:00' }] },
    ]
    const parsed = parseBestTimes(bare)
    expect(parsed).toHaveLength(1)
    // Reading them is only legal now because the type admits they may be missing.
    expect(parsed![0]!.reasoning_summary).toBeUndefined()
    expect(parsed![0]!.avoid).toBeUndefined()
    expect(parsed![0]!.best_time_windows[0]!.label).toBeUndefined()
  })

  /**
   * The shape the column ACTUALLY holds. Every writer wraps the array in
   * `{ platforms, upgrade_note }` and every reader passes the whole column, but
   * this only accepted a bare array — so every client's suggestions parsed to
   * null and the calendar drew no slots at all. The suite stayed green because
   * it only ever fed the function the inner array, which no call site has.
   */
  it('accepts the wrapper the column actually stores', () => {
    const stored = { platforms: valid, upgrade_note: 'Refreshed nightly.' }
    expect(parseBestTimes(stored)).toHaveLength(1)
    expect(parseBestTimes(stored)![0]!.best_time_windows[0]!.time).toBe('18:00')
  })

  it('still accepts a bare array, so neither writer depends on the other', () => {
    expect(parseBestTimes(valid)).toHaveLength(1)
  })

  it('rejects a wrapper whose entries are malformed, not just a malformed wrapper', () => {
    // The model writes time RANGES ("19:00-21:00"), which fail HH:MM. Those rows
    // stay dark on purpose until they regenerate — absent data becomes absence.
    const ranged = {
      platforms: [{ ...valid[0], best_time_windows: [{ time: '19:00-21:00' }] }],
    }
    expect(parseBestTimes(ranged)).toBeNull()
  })

  it('treats an empty platforms array as nothing stored', () => {
    expect(parseBestTimes({ platforms: [] })).toBeNull()
  })
})

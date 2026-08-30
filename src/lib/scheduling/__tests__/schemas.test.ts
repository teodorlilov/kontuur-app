import { describe, expect, it } from 'vitest'
import { isObservedBestTime, OBSERVED_CONFIDENCE, parseBestTimes } from '../schemas'

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

/**
 * Which kind of data a stored row holds.
 *
 * The two writers of this column are not equal in authority — one reads a real weekday x hour grid
 * of when a client's followers are online, the other asks a model to imagine posting times from four
 * profile fields — and until this existed, the rule was written in a comment and enforced nowhere.
 * The generate cron could not ask the question, so its 30-day refresh timer could replace measured
 * data with a guess whenever a client's Meta sync had lapsed.
 */
describe('isObservedBestTime', () => {
  const observed = {
    platforms: [
      {
        platform: 'Instagram',
        best_days: ['Tuesday'],
        best_time_windows: [{ time: '18:00' }],
        confidence: OBSERVED_CONFIDENCE,
      },
    ],
    upgrade_note: '',
  }
  const guessed = {
    platforms: [
      {
        platform: 'Instagram',
        best_days: ['Tuesday'],
        best_time_windows: [{ time: '18:00' }],
        confidence: 'high',
      },
    ],
    upgrade_note: '',
  }

  it('recognises a row derived from the follower-online grid', () => {
    expect(isObservedBestTime(observed)).toBe(true)
  })

  it('does not mistake a confident model guess for measurement', () => {
    // The model has returned 'high' and 'very-sure' for its own invention. Confidence the model
    // asserts about itself is not evidence, and only one exact value means measured.
    expect(isObservedBestTime(guessed)).toBe(false)
  })

  it('treats a row with no confidence at all as a guess', () => {
    const bare = { platforms: [{ ...guessed.platforms[0], confidence: undefined }] }
    expect(isObservedBestTime(bare)).toBe(false)
  })

  it('says no to anything unusable rather than throwing', () => {
    // A cron decides whether to spend an LLM call on this answer; it must not be a crash site.
    expect(isObservedBestTime(null)).toBe(false)
    expect(isObservedBestTime({ platforms: [] })).toBe(false)
    expect(isObservedBestTime('nonsense')).toBe(false)
  })

  it('reads the wrapper the writers actually store, not a bare array', () => {
    // The whole reason parseBestTimes exists. Asking this question with an Array.isArray check
    // would answer false for every real row, which is how the wizard's Best time option died.
    expect(Array.isArray(observed)).toBe(false)
    expect(isObservedBestTime(observed)).toBe(true)
  })
})

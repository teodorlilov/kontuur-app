import { parseBestTimes } from '../schemas'
import { describe, it, expect } from 'vitest'
import { pickNextOpenSlot, suggestionPlatform, suggestWeekSlots } from '../slot-picker'
import { formatScheduledAt } from '@/utils/date-helpers'
import type { BestTimePlatform } from '@/lib/scheduling/schemas'

/**
 * The agency zone, now that `SlotPickerInput` requires one.
 *
 * Every instant in this file is built through `formatScheduledAt` rather than
 * `new Date('...T18:00:00')`. That bare-string form is a local-time parse, so it resolves
 * in whatever zone the machine running the suite happens to be in. It survived here only
 * while the code under test read that same runtime zone — once the picker took an explicit
 * `timeZone`, the two sides stopped moving together and the assertions passed on a laptop
 * in Sofia while failing on CI in UTC. Expressed through the helper the app writes with,
 * they say what they mean: 18:00 *there*, on any machine.
 */
const TZ = 'Europe/Sofia'

// Tuesday 4 Aug 2026, 12:00 in the agency zone.
const now = new Date(formatScheduledAt('2026-08-04', '12:00', TZ))

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
    timeZone: TZ,
    ...overrides,
  })
}

describe('pickNextOpenSlot', () => {
  it('picks the earliest upcoming best-time slot', () => {
    // Thursday 6 Aug beats Friday 7 Aug.
    expect(pick()).toBe(formatScheduledAt('2026-08-06', '18:00', TZ))
  })

  it('skips a day the client already posts', () => {
    expect(pick({ occupiedSlots: [formatScheduledAt('2026-08-06', '09:00', TZ)] })).toBe(
      formatScheduledAt('2026-08-07', '18:00', TZ)
    )
  })

  it('rolls to next week when this week hits the posts-per-week target', () => {
    const occupied = [
      formatScheduledAt('2026-08-03', '09:00', TZ),
      formatScheduledAt('2026-08-04', '09:00', TZ),
      formatScheduledAt('2026-08-05', '09:00', TZ),
    ]
    expect(pick({ postsPerWeek: 3, occupiedSlots: occupied })).toBe(
      formatScheduledAt('2026-08-13', '18:00', TZ)
    )
  })

  it('a zero target means no weekly cap', () => {
    const occupied = [formatScheduledAt('2026-08-03', '09:00', TZ)]
    expect(pick({ postsPerWeek: 0, occupiedSlots: occupied })).toBe(
      formatScheduledAt('2026-08-06', '18:00', TZ)
    )
  })

  it('a same-day slot still counts while its time is ahead', () => {
    const tuesdayTimes: BestTimePlatform[] = [{ ...bestTimes[0]!, best_days: ['Tuesday'] }]
    expect(pick({ bestTimes: tuesdayTimes })).toBe(formatScheduledAt('2026-08-04', '18:00', TZ))
  })

  it('returns null without best-time data for the platform', () => {
    expect(pick({ bestTimes: null })).toBeNull()
    expect(pick({ platform: 'LinkedIn' })).toBeNull()
    expect(pick({ platform: null })).toBeNull()
  })
})

describe('the three-week candidate span', () => {
  /**
   * The regression this guards: building candidates from whole calendar weeks drops one
   * when the best day is already past in the current week. On a Friday, for a client
   * whose only best day is Monday, this week's Monday is behind `now` and filtered out —
   * so two weeks of candidates leaves exactly one, and occupying it returns null.
   */
  const friday = new Date(formatScheduledAt('2026-08-07', '12:00', TZ))
  const mondayOnly: BestTimePlatform[] = [{ ...bestTimes[0]!, best_days: ['Monday'] }]

  it('still finds a slot when the next occurrence is occupied', () => {
    const result = pickNextOpenSlot({
      platform: 'Instagram',
      bestTimes: mondayOnly,
      postsPerWeek: 0,
      // Monday 10 Aug taken, so the answer has to come from the week after.
      occupiedSlots: [formatScheduledAt('2026-08-10', '09:00', TZ)],
      now: friday,
      timeZone: TZ,
    })
    expect(result).toBe(formatScheduledAt('2026-08-17', '18:00', TZ))
  })

  it('offers the nearest future occurrence when nothing is taken', () => {
    const result = pickNextOpenSlot({
      platform: 'Instagram',
      bestTimes: mondayOnly,
      postsPerWeek: 0,
      occupiedSlots: [],
      now: friday,
      timeZone: TZ,
    })
    expect(result).toBe(formatScheduledAt('2026-08-10', '18:00', TZ))
  })
})

describe('suggestWeekSlots', () => {
  it('returns every matching day × window in the week, ascending', () => {
    // Thursday 6 and Friday 7 August 2026.
    expect(
      suggestWeekSlots({
        platform: 'Instagram',
        bestTimes,
        weekStartISO: '2026-08-03',
        timeZone: TZ,
      })
    ).toEqual([
      formatScheduledAt('2026-08-06', '18:00', TZ),
      formatScheduledAt('2026-08-07', '18:00', TZ),
    ])
  })

  it('reads the times as wall-clock in the agency zone', () => {
    const [first] = suggestWeekSlots({
      platform: 'Instagram',
      bestTimes,
      weekStartISO: '2026-08-03',
      timeZone: TZ,
    })
    // 18:00 Sofia in August (UTC+3) is 15:00Z — not 18:00Z, and not the runtime's 18:00.
    expect(first).toBe('2026-08-06T15:00:00.000Z')
  })

  it('degrades to nothing rather than guessing', () => {
    expect(
      suggestWeekSlots({
        platform: 'Instagram',
        bestTimes: null,
        weekStartISO: '2026-08-03',
        timeZone: TZ,
      })
    ).toEqual([])
    expect(
      suggestWeekSlots({ platform: null, bestTimes, weekStartISO: '2026-08-03', timeZone: TZ })
    ).toEqual([])
    expect(
      suggestWeekSlots({
        platform: 'LinkedIn',
        bestTimes,
        weekStartISO: '2026-08-03',
        timeZone: TZ,
      })
    ).toEqual([])
  })

  it('ignores an entry whose days or windows are empty', () => {
    const hollow: BestTimePlatform[] = [{ ...bestTimes[0]!, best_days: [] }]
    expect(
      suggestWeekSlots({
        platform: 'Instagram',
        bestTimes: hollow,
        weekStartISO: '2026-08-03',
        timeZone: TZ,
      })
    ).toEqual([])
  })
})

describe('suggestionPlatform', () => {
  function entry(platform: string): BestTimePlatform {
    return {
      platform,
      best_days: ['Thursday'],
      best_time_windows: [window],
      avoid: '',
      confidence: 'ai-derived',
      reasoning_summary: '',
    }
  }

  it('returns null when nothing is stored, so the caller draws no slots', () => {
    expect(suggestionPlatform(null)).toBeNull()
    expect(suggestionPlatform([])).toBeNull()
  })

  it('prefers Instagram when the client has it', () => {
    expect(suggestionPlatform([entry('Facebook'), entry('Instagram')])).toBe('Instagram')
  })

  it('matches Instagram whatever case it was stored in', () => {
    expect(suggestionPlatform([entry('instagram')])).toBe('instagram')
  })

  it('falls back to what the client does have', () => {
    // The calendar hardcoded 'Instagram' for every client, so this one matched no stored
    // entry, drew no slots, and read as permanently uncovered.
    expect(suggestionPlatform([entry('Facebook')])).toBe('Facebook')
  })

  it('resolves to a platform suggestWeekSlots can actually use', () => {
    const facebook = [entry('Facebook')]
    const slots = suggestWeekSlots({
      platform: suggestionPlatform(facebook),
      bestTimes: facebook,
      weekStartISO: '2026-08-03',
      timeZone: TZ,
    })
    expect(slots).toEqual([formatScheduledAt('2026-08-06', '18:00', TZ)])
  })
})

/**
 * End to end from the column to the grid, on the blob brand_profiles actually
 * holds. This is the pairing that was broken: the parse returned null for every
 * stored row, so the picker had nothing to work from and the calendar drew no
 * suggestions for anyone.
 */
describe('from the stored column to the week grid', () => {
  const STORED = {
    platforms: [
      {
        platform: 'Instagram',
        best_days: ['Tuesday', 'Wednesday', 'Thursday'],
        best_time_windows: [{ time: '16:00' }, { time: '17:00' }, { time: '22:00' }],
        confidence: 'observed',
        reasoning_summary: "Derived from Instagram's hourly follower-online counts.",
      },
    ],
    upgrade_note: 'Refreshed nightly from observed follower activity.',
  }

  it('yields a slot per best day per window', () => {
    const slots = suggestWeekSlots({
      platform: 'Instagram',
      bestTimes: parseBestTimes(STORED),
      weekStartISO: '2026-08-17',
      timeZone: 'Europe/Sofia',
    })
    // Three days, three windows. It was 0 while the wrapper failed to parse.
    expect(slots).toHaveLength(9)
    expect(slots[0]).toContain('2026-08-18')
    expect(new Set(slots.map((iso) => iso.slice(0, 10)))).toEqual(
      new Set(['2026-08-18', '2026-08-19', '2026-08-20'])
    )
  })

  it('draws nothing for a row whose windows are ranges — unchanged, and deliberate', () => {
    const ranged = {
      platforms: [{ ...STORED.platforms[0]!, best_time_windows: [{ time: '19:00-21:00' }] }],
    }
    expect(
      suggestWeekSlots({
        platform: 'Instagram',
        bestTimes: parseBestTimes(ranged),
        weekStartISO: '2026-08-17',
        timeZone: 'Europe/Sofia',
      })
    ).toEqual([])
  })
})

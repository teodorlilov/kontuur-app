import { describe, it, expect } from 'vitest'
import {
  buildClientWeek,
  buildWeekLanes,
  describeCoverage,
  groupPostsByDate,
  strongestState,
  type ClientDay,
} from '../lib/week-model'
import type { CalendarPost } from '@/types/api'

/** Only the two fields groupPostsByDate reads; the rest of CalendarPost is irrelevant here. */
function post(id: string, scheduledAt: string): CalendarPost {
  return { id, scheduled_at: scheduledAt } as CalendarPost
}

describe('groupPostsByDate', () => {
  it('buckets by the agency day, not the UTC day', () => {
    // 22:30Z on the 6th is already 01:30 on the 7th in Sofia, and still the 6th in London.
    // Slicing the raw column gave both agencies the 6th.
    const posts = [post('a', '2026-08-06T22:30:00.000Z')]

    expect([...groupPostsByDate(posts, 'Europe/Sofia').keys()]).toEqual(['2026-08-07'])
    expect([...groupPostsByDate(posts, 'Europe/London').keys()]).toEqual(['2026-08-06'])
  })

  it('orders each day by scheduled_at, whatever order the query returned', () => {
    // The page orders created_at DESC, so a day's posts arrive newest-first.
    const posts = [
      post('evening', '2026-08-06T15:00:00.000Z'),
      post('morning', '2026-08-06T06:00:00.000Z'),
      post('midday', '2026-08-06T09:00:00.000Z'),
    ]

    const day = groupPostsByDate(posts, 'Europe/Sofia').get('2026-08-06')
    expect(day?.map((p) => p.id)).toEqual(['morning', 'midday', 'evening'])
  })

  it('skips unscheduled posts', () => {
    expect(groupPostsByDate([post('a', '') ], 'Europe/Sofia').size).toBe(0)
  })
})

describe('buildClientWeek', () => {
  const week = '2026-08-03' // Mon 3 – Sun 9 Aug 2026

  function withStatus(id: string, clientId: string, at: string, status: string): CalendarPost {
    return { id, client_id: clientId, scheduled_at: at, status } as CalendarPost
  }

  it('reports a client with nothing placed as dark', () => {
    const result = buildClientWeek({
      clientId: 'bd',
      lanes: buildWeekLanes({
        posts: [],
        clients: [],
        weekStartISO: week,
        timeZone: 'Europe/Sofia',
        now: new Date('2026-08-03T00:00:00Z'),
      }),
      weekStartISO: week,
      target: 2,
    })
    expect(result.filled).toBe(0)
    expect(result.verdict).toBe('Dark this week')
    expect(result.week).toEqual(Array(7).fill({ state: 'none', at: null }))
  })

  it('counts posts, not days — two on one Tuesday is two towards the target', () => {
    const posts = [
      withStatus('a', 'hn', '2026-08-04T06:00:00.000Z', 'scheduled'),
      withStatus('b', 'hn', '2026-08-04T15:00:00.000Z', 'scheduled'),
    ]
    const result = buildClientWeek({
      clientId: 'hn',
      lanes: buildWeekLanes({
        posts: posts,
        clients: [],
        weekStartISO: week,
        timeZone: 'Europe/Sofia',
        now: new Date('2026-08-03T00:00:00Z'),
      }),
      weekStartISO: week,
      target: 3,
    })
    expect(result.filled).toBe(2)
    expect(result.verdict).toBe('1 short')
  })

  it('lets a failure outrank a published post on the same day', () => {
    // The day still needs a human; showing the success would hide that.
    const posts = [
      withStatus('ok', 'vb', '2026-08-05T06:00:00.000Z', 'published'),
      withStatus('bad', 'vb', '2026-08-05T15:00:00.000Z', 'failed'),
    ]
    const result = buildClientWeek({
      clientId: 'vb',
      lanes: buildWeekLanes({
        posts: posts,
        clients: [],
        weekStartISO: week,
        timeZone: 'Europe/Sofia',
        now: new Date('2026-08-03T00:00:00Z'),
      }),
      weekStartISO: week,
      target: 2,
    })
    expect(result.week[2]?.state).toBe('failed')
    // And it carries the *failure's* hour, not the published post's. The cell prints
    // this, so showing 09:00 beside a clay chip would name the wrong post.
    expect(result.week[2]?.at).toBe('2026-08-05T15:00:00.000Z')
    expect(result.verdict).toBe('On track')
  })

  it('ignores other clients posts', () => {
    const posts = [withStatus('a', 'someone-else', '2026-08-04T06:00:00.000Z', 'scheduled')]
    const result = buildClientWeek({
      clientId: 'hn',
      lanes: buildWeekLanes({
        posts: posts,
        clients: [],
        weekStartISO: week,
        timeZone: 'Europe/Sofia',
        now: new Date('2026-08-03T00:00:00Z'),
      }),
      weekStartISO: week,
      target: 1,
    })
    expect(result.verdict).toBe('Dark this week')
  })

  it('reports no verdict when nobody has set a cadence', () => {
    // An absent target is not a failing one.
    const result = buildClientWeek({
      clientId: 'hn',
      lanes: buildWeekLanes({
        posts: [],
        clients: [],
        weekStartISO: week,
        timeZone: 'Europe/Sofia',
        now: new Date('2026-08-03T00:00:00Z'),
      }),
      weekStartISO: week,
      target: 0,
    })
    expect(result.verdict).toBe('No cadence set')
  })
})

describe('strongestState', () => {
  it('is none for a day with nothing on it', () => {
    expect(strongestState([])).toBe('none')
  })

  it.each([
    ['published', 'failed'],
    ['failed', 'published'],
  ])('lets a failure outrank a success, given %s then %s', (first, second) => {
    // A day holding one published post and one failure is a day that needs a human;
    // surfacing the success would hide the only thing on it asking for something.
    // Both orderings, because the reduction runs over whatever order the query
    // returned — a ranking sensitive to that would shade the same day two ways.
    const day = [
      { id: 'a', status: first },
      { id: 'b', status: second },
    ] as CalendarPost[]
    expect(strongestState(day)).toBe('failed')
  })

  it('reads a published day as published, not merely scheduled', () => {
    const day = [
      { id: 'a', status: 'scheduled' },
      { id: 'b', status: 'published' },
    ] as CalendarPost[]
    expect(strongestState(day)).toBe('published')
  })

  it('reads everything still in flight as scheduled', () => {
    // `publishing` is proceeding, not a problem — the month must not render a post
    // mid-send as anything louder than one waiting to go.
    expect(strongestState([{ id: 'a', status: 'publishing' }] as CalendarPost[])).toBe('scheduled')
  })
})

describe('describeCoverage', () => {
  const SOFIA = 'Europe/Sofia'
  const empty = (): ClientDay[] => Array.from({ length: 7 }, () => ({ state: 'none', at: null }))

  function week(overrides: Record<number, ClientDay>): ClientDay[] {
    const days = empty()
    for (const [index, day] of Object.entries(overrides)) days[Number(index)] = day
    return days
  }

  it('names every non-empty day, in order, with its hour', () => {
    // The hour is spoken because it is printed in the cell. A spoken equivalent that
    // omits what the sighted reader sees is a lesser strip, not an equal one.
    const said = describeCoverage(
      week({
        0: { state: 'published', at: '2026-08-03T06:00:00.000Z' },
        2: { state: 'failed', at: '2026-08-05T15:00:00.000Z' },
      }),
      SOFIA
    )
    expect(said).toBe('Monday 09:00 published, Wednesday 18:00 failed to publish.')
  })

  it('resolves the hour in the agency zone, not the runtime', () => {
    // 21:30Z is 00:30 the next day in Sofia — the same instant the grid buckets forward.
    const said = describeCoverage(week({ 1: { state: 'scheduled', at: '2026-08-04T21:30:00.000Z' } }), SOFIA)
    expect(said).toBe('Tuesday 00:30 scheduled.')
  })

  it('names a day that has a state but no instant', () => {
    expect(describeCoverage(week({ 0: { state: 'open', at: null } }), SOFIA)).toBe(
      'Monday an open slot.'
    )
  })

  it('says so when the week is empty', () => {
    expect(describeCoverage(empty(), SOFIA)).toBe('Nothing this week.')
  })
})

describe('buildWeekLanes', () => {
  const week = '2026-08-03'
  const tz = 'Europe/Sofia'
  const bestTimes = [
    {
      platform: 'Instagram',
      best_days: ['Thursday'],
      best_time_windows: [{ time: '10:00', label: 'morning', reason: 'peak' }],
      avoid: '',
      confidence: 'ai-derived',
      reasoning_summary: '',
    },
  ] as never

  const client = { id: 'bd', name: 'Билков Дом', platform: 'Instagram', bestTimes }

  it('draws a suggested slot on a day the client has nothing', () => {
    const lanes = buildWeekLanes({
      posts: [],
      clients: [client],
      weekStartISO: week,
      timeZone: tz,
      now: new Date('2026-08-03T09:00:00Z'),
    })
    const thursday = lanes.get('2026-08-06') ?? []
    expect(thursday).toHaveLength(1)
    expect(thursday[0]).toMatchObject({ kind: 'slot', clientId: 'bd', missed: false })
  })

  it('drops the slot when that client already posts that day', () => {
    // Matched on the day, not the timestamp: a post moved from 10:00 to 14:00 still
    // fills that day, and pairing on the exact time would draw a ghost beside it.
    const posts = [
      { id: 'p', client_id: 'bd', scheduled_at: '2026-08-06T11:00:00.000Z', status: 'scheduled' },
    ] as CalendarPost[]
    const lanes = buildWeekLanes({
      posts,
      clients: [client],
      weekStartISO: week,
      timeZone: tz,
      now: new Date('2026-08-03T09:00:00Z'),
    })
    expect((lanes.get('2026-08-06') ?? []).filter((i) => i.kind === 'slot')).toHaveLength(0)
  })

  it('marks a slot whose time has passed as missed', () => {
    const lanes = buildWeekLanes({
      posts: [],
      clients: [client],
      weekStartISO: week,
      timeZone: tz,
      now: new Date('2026-08-08T09:00:00Z'), // Saturday — Thursday is gone
    })
    expect(lanes.get('2026-08-06')?.[0]).toMatchObject({ kind: 'slot', missed: true })
  })

  it('draws nothing for a client with no stored suggestion', () => {
    const lanes = buildWeekLanes({
      posts: [],
      clients: [{ ...client, bestTimes: null }],
      weekStartISO: week,
      timeZone: tz,
      now: new Date('2026-08-03T09:00:00Z'),
    })
    // Degrades to nothing, never to a guess.
    expect([...lanes.values()].flat()).toHaveLength(0)
  })

  it('orders posts and slots together by time', () => {
    const posts = [
      { id: 'p', client_id: 'other', scheduled_at: '2026-08-06T05:00:00.000Z', status: 'scheduled' },
    ] as CalendarPost[]
    const lanes = buildWeekLanes({
      posts,
      clients: [client],
      weekStartISO: week,
      timeZone: tz,
      now: new Date('2026-08-03T09:00:00Z'),
    })
    // 08:00 Sofia post, then the 10:00 Sofia slot.
    expect((lanes.get('2026-08-06') ?? []).map((i) => i.kind)).toEqual(['post', 'slot'])
  })
})

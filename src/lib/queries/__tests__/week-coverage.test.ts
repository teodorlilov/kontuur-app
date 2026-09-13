import { describe, expect, it } from 'vitest'
import { emptyWeek, foldWeekCoverage } from '../week-coverage'
import { getWeekDayKeys } from '@/utils/date-helpers'

const ZONE = 'Europe/Sofia'
const WEEK = '2026-09-07'
const DAY_KEYS = getWeekDayKeys(WEEK)

function published(id: string, at: string, clientId = 'c1') {
  return { id, client_id: clientId, post_publications: [{ published_at: at }] }
}

function due(
  id: string,
  scheduledAt: string,
  status: 'unpublished' | 'publishing' | 'failed' = 'unpublished',
  clientId = 'c1'
) {
  return {
    id,
    client_id: clientId,
    scheduled_at: scheduledAt,
    post_publications:
      status === 'unpublished'
        ? []
        : [
            {
              id: `${id}-pub`,
              platform: 'instagram',
              status,
              published_at: null,
              publish_error: null,
            },
          ],
  }
}

function fold(input: {
  published?: ReturnType<typeof published>[]
  due?: ReturnType<typeof due>[]
}) {
  return foldWeekCoverage({
    published: input.published ?? [],
    due: input.due ?? [],
    dayKeys: DAY_KEYS,
    timeZone: ZONE,
  })
}

describe('foldWeekCoverage', () => {
  it('returns nothing for a week with no posts', () => {
    expect(fold({})).toEqual({})
  })

  it('places a scheduled post on the day its slot falls in the agency zone', () => {
    const week = fold({ due: [due('p1', '2026-09-08T07:00:00Z')] }).c1
    expect(week?.[1]).toEqual({
      state: 'scheduled',
      postId: 'p1',
      at: '2026-09-08T07:00:00Z',
      count: 1,
    })
    expect(week?.filter((day) => day.state === 'open')).toHaveLength(6)
  })

  it('lets a publish beat a scheduled post on the same day, whichever came first', () => {
    const week = fold({
      due: [due('later', '2026-09-08T06:00:00Z')],
      published: [published('live', '2026-09-08T09:00:00Z')],
    }).c1
    expect(week?.[1]).toMatchObject({ state: 'published', postId: 'live', count: 2 })
  })

  it('names the earliest post of the winning state', () => {
    const week = fold({
      due: [due('noon', '2026-09-09T12:00:00Z'), due('dawn', '2026-09-09T05:00:00Z')],
    }).c1
    expect(week?.[2]).toMatchObject({ state: 'scheduled', postId: 'dawn', count: 2 })
  })

  it('counts a post that appears in both halves once', () => {
    const week = fold({
      due: [due('mid', '2026-09-10T10:00:00Z', 'publishing')],
      published: [published('mid', '2026-09-10T10:00:00Z')],
    }).c1
    expect(week?.[3]).toMatchObject({ state: 'published', postId: 'mid', count: 1 })
  })

  it('does not draw a permanently failed slot as covered', () => {
    const week = fold({ due: [due('dead', '2026-09-11T10:00:00Z', 'failed')] }).c1
    expect(week).toBeUndefined()
  })

  it('skips a stamp outside the week', () => {
    expect(fold({ due: [due('next', '2026-09-15T10:00:00Z')] })).toEqual({})
  })

  it('keeps clients apart', () => {
    const coverage = fold({
      due: [
        due('a', '2026-09-07T10:00:00Z', 'unpublished', 'c1'),
        due('b', '2026-09-07T10:00:00Z', 'unpublished', 'c2'),
      ],
    })
    expect(coverage.c1?.[0]?.postId).toBe('a')
    expect(coverage.c2?.[0]?.postId).toBe('b')
  })

  it('buckets a near-midnight instant in the agency zone, not UTC', () => {
    const week = fold({ due: [due('late', '2026-09-08T22:30:00Z')] }).c1
    expect(week?.[2]?.state).toBe('scheduled')
    expect(week?.[1]?.state).toBe('open')
  })
})

describe('emptyWeek', () => {
  it('is seven open days that share nothing', () => {
    const week = emptyWeek()
    expect(week).toHaveLength(7)
    expect(week.every((day) => day.state === 'open' && day.count === 0)).toBe(true)
    expect(week[0]).not.toBe(week[1])
  })
})

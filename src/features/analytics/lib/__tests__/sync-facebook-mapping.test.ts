import { describe, expect, it } from 'vitest'
import { toPostMetricRow, zipPageDays } from '../facebook/sync-facebook-metrics'
import { EMPTY_PAGE_SERIES } from './fixtures'

/**
 * The two mappings between Graph's answers and the stored rows — the exact spots where a wrong
 * default becomes wrong analytics. Absence means opposite things on the two sides, both probed
 * (docs/META-FB-PROBE.md): a post's `shares` field is omitted when genuinely zero, while an
 * insights series omitting a day means Meta served nothing for it.
 */

describe('zipPageDays', () => {
  /**
   * `page_follows` carries the follower LEVEL, so it lands in `followers_count`. A metric Meta
   * did not serve for a day stays ABSENT from that row, so the partial upsert cannot null out
   * what a fuller capture stored.
   */
  it('zips per-metric series into day rows, leaving unserved metrics absent', () => {
    const rows = zipPageDays('client-1', 'page-1', {
      ...EMPTY_PAGE_SERIES,
      page_follows: [
        { date: '2026-09-03', value: 64 },
        { date: '2026-09-04', value: 64 },
      ],
      page_post_engagements: [{ date: '2026-09-04', value: 3 }],
    })

    expect(rows).toHaveLength(2)
    const day3 = rows.find((row) => row.metric_date === '2026-09-03')!
    const day4 = rows.find((row) => row.metric_date === '2026-09-04')!
    expect(day3.followers_count).toBe(64)
    expect(day4.post_engagements).toBe(3)
    expect('post_engagements' in day3).toBe(false)
    expect('unfollows' in day4).toBe(false)
    expect(day3.client_id).toBe('client-1')
    expect(day3.page_id).toBe('page-1')
  })

  it('returns nothing when every series is empty — silence is not a row of zeros', () => {
    expect(zipPageDays('client-1', 'page-1', EMPTY_PAGE_SERIES)).toEqual([])
  })
})

describe('toPostMetricRow', () => {
  /** `shares` is absent here as it was in the probe's 200; the rest is fixture, not transcript. */
  const post = {
    id: '723701000827665_122167637282960180',
    created_time: '2026-09-05T14:20:00+0000',
    message: 'hello',
    permalink_url: 'https://facebook.com/p',
    full_picture: 'https://cdn/p.jpg',
    reactions: { summary: { total_count: 5 } },
    comments: { summary: { total_count: 2 } },
  }

  /** Reach is dead at Meta's end for Pages, so it is stored as the truth: absent, never zero. */
  it('maps tallies honestly: absent shares is zero, the total is the computed sum', () => {
    const row = toPostMetricRow('client-1', 'page-1', post, new Map([[post.id, 'post-uuid']]))
    expect(row.platform).toBe('facebook')
    expect(row.platform_account_id).toBe('page-1')
    expect(row.post_id).toBe('post-uuid')
    expect(row.like_count).toBe(5)
    expect(row.comments_count).toBe(2)
    expect(row.shares).toBe(0)
    expect(row.total_interactions).toBe(7)
    expect(row.reach).toBeUndefined()
    expect(row.media_type).toBeNull()
  })

  /**
   * The two absences are opposite answers: a missing `shares` field still reads as zero, but a
   * sum with no real inputs would claim a measurement that never happened.
   */
  it('keeps the total null when Meta served no tallies at all', () => {
    const row = toPostMetricRow(
      'client-1',
      'page-1',
      { id: 'x', created_time: '2026-09-05T14:20:00+0000' },
      new Map()
    )
    expect(row.like_count).toBeNull()
    expect(row.comments_count).toBeNull()
    expect(row.shares).toBe(0)
    expect(row.total_interactions).toBeNull()
  })
})

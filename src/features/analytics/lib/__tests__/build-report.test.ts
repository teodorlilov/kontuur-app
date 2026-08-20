import { describe, expect, it } from 'vitest'
import type { IGAccountMetricColumns, IGPostMetricColumns } from '@/lib/queries/select-columns'
import {
  buildAnalyticsReport,
  deltaPct,
  humanizeDimension,
  sumOrNull,
  type BuildReportInput,
} from '../build-report'
import type { AnalyticsPeriod } from '../period'

/** A 4-day period (Aug 15–18) against the 4 days before it (Aug 11–14). */
const PERIOD: AnalyticsPeriod = {
  preset: 'custom',
  start: '2026-08-15',
  end: '2026-08-18',
  prevStart: '2026-08-11',
  prevEnd: '2026-08-14',
  days: 4,
}

function accountRow(overrides: Partial<IGAccountMetricColumns>): IGAccountMetricColumns {
  return {
    metric_date: '2026-08-15',
    followers_count: null,
    reach: null,
    views: null,
    total_interactions: null,
    likes: null,
    comments: null,
    saves: null,
    shares: null,
    replies: null,
    profile_views: null,
    website_clicks: null,
    follows: null,
    unfollows: null,
    reach_by_media_product_type: null,
    link_taps_by_button_type: null,
    fetched_at: '2026-08-19T03:30:00Z',
    ...overrides,
  }
}

function postRow(overrides: Partial<IGPostMetricColumns>): IGPostMetricColumns {
  return {
    ig_media_id: 'm1',
    post_id: null,
    media_type: 'IMAGE',
    media_product_type: 'FEED',
    permalink: null,
    thumbnail_url: null,
    caption: null,
    posted_at: null,
    reach: null,
    views: null,
    like_count: null,
    comments_count: null,
    saved: null,
    shares: null,
    total_interactions: null,
    follows: null,
    profile_visits: null,
    ...overrides,
  }
}

function build(input: Partial<BuildReportInput>): ReturnType<typeof buildAnalyticsReport> {
  return buildAnalyticsReport({
    period: PERIOD,
    accountRows: [],
    postRows: [],
    currentSnapshot: null,
    previousSnapshot: null,
    hasHistory: true,
    lastSyncAt: '2026-08-19T03:30:00Z',
    ...input,
  })
}

describe('sumOrNull', () => {
  it('is null only when every input was null', () => {
    expect(sumOrNull([])).toBeNull()
    expect(sumOrNull([null, null])).toBeNull()
    expect(sumOrNull([null, 2, 3])).toBe(5)
    // The probe's contract: an explicit 0 is data, not absence.
    expect(sumOrNull([0, null])).toBe(0)
  })
})

describe('deltaPct', () => {
  it('is null whenever the comparison is unknowable', () => {
    expect(deltaPct(null, 10)).toBeNull()
    expect(deltaPct(10, null)).toBeNull()
    expect(deltaPct(10, 0)).toBeNull()
    expect(deltaPct(115, 100)).toBeCloseTo(15)
    expect(deltaPct(85, 100)).toBeCloseTo(-15)
  })
})

describe('humanizeDimension', () => {
  it('turns API enums into words', () => {
    expect(humanizeDimension('BOOK_NOW')).toBe('Book now')
    expect(humanizeDimension('WEBSITE')).toBe('Website')
  })
})

describe('buildAnalyticsReport', () => {
  it('sums both periods, keeps day alignment, and leaves missing days null', () => {
    const report = build({
      accountRows: [
        accountRow({ metric_date: '2026-08-11', reach: 100, views: 200 }),
        accountRow({ metric_date: '2026-08-14', reach: 100, views: 200 }),
        accountRow({ metric_date: '2026-08-15', reach: 150, views: 300 }),
        // Aug 16 missing entirely; Aug 17 present but reach unknown.
        accountRow({ metric_date: '2026-08-17', reach: null, views: 100 }),
        accountRow({ metric_date: '2026-08-18', reach: 250, views: null }),
      ],
    })
    expect(report.reach.now).toBe(400)
    expect(report.reach.then).toBe(200)
    expect(report.reach.deltaPct).toBeCloseTo(100)
    expect(report.reach.series).toEqual([150, null, null, 250])
    expect(report.views.now).toBe(400)
    // Day-by-day pairs align by index: day 1 of now against day 1 of then.
    expect(report.reachByDay[0]).toEqual({
      date: '2026-08-15',
      now: 150,
      then: 100,
      views: 300,
      posts: [],
    })
    expect(report.reachByDay[3]).toEqual({
      date: '2026-08-18',
      now: 250,
      then: 100,
      views: null,
      posts: [],
    })
  })

  it('pins each publication onto its calendar day, strongest reach first', () => {
    const report = build({
      postRows: [
        postRow({
          ig_media_id: 'a',
          posted_at: '2026-08-16T09:00:00Z',
          reach: 200,
          caption: 'Small',
        }),
        postRow({
          ig_media_id: 'b',
          posted_at: '2026-08-16T18:00:00Z',
          reach: 900,
          follows: 3,
          caption: 'Big',
        }),
        // No timestamp means no day to pin to — the table still lists it.
        postRow({ ig_media_id: 'c', posted_at: null, reach: 500 }),
      ],
    })
    const day = report.reachByDay[1]!
    expect(day.posts.map((post) => post.igMediaId)).toEqual(['b', 'a'])
    expect(day.posts[0]).toMatchObject({ caption: 'Big', reach: 900, follows: 3 })
    expect(report.reachByDay[0]!.posts).toEqual([])
    expect(report.reachByDay.flatMap((d) => d.posts).some((p) => p.igMediaId === 'c')).toBe(false)
    expect(report.posts).toHaveLength(3)
  })

  it('keeps the all-null period distinct from a zero period', () => {
    const report = build({
      accountRows: [accountRow({ metric_date: '2026-08-15', views: 0 })],
    })
    expect(report.views.now).toBe(0)
    expect(report.views.then).toBeNull()
    expect(report.views.deltaPct).toBeNull()
  })

  it('builds the follower story: gained, lost, net, latest total', () => {
    const report = build({
      accountRows: [
        accountRow({ metric_date: '2026-08-12', follows: 3, unfollows: 1 }),
        accountRow({ metric_date: '2026-08-15', follows: 5, unfollows: 2, followers_count: 830 }),
        accountRow({ metric_date: '2026-08-16', follows: 4, unfollows: 0, followers_count: 834 }),
      ],
    })
    expect(report.followers.gained.now).toBe(9)
    expect(report.followers.lost.now).toBe(2)
    expect(report.followers.net.now).toBe(7)
    expect(report.followers.net.then).toBe(2)
    // Latest known total, not the period's first.
    expect(report.followers.total).toBe(834)
  })

  it('computes engagement rate as period interactions over period reach', () => {
    const report = build({
      accountRows: [
        accountRow({ metric_date: '2026-08-15', reach: 1000, total_interactions: 46 }),
        accountRow({ metric_date: '2026-08-12', reach: 1000, total_interactions: 42 }),
      ],
    })
    expect(report.engagementRate.now).toBeCloseTo(4.6)
    expect(report.engagementRate.then).toBeCloseTo(4.2)
    expect(report.engagementRate.deltaPt).toBeCloseTo(0.4)
  })

  it('aggregates format reach from the stored breakdown maps and skips bad json', () => {
    const report = build({
      accountRows: [
        accountRow({
          metric_date: '2026-08-15',
          reach_by_media_product_type: { POST: 10, CAROUSEL_CONTAINER: 30 },
        }),
        accountRow({
          metric_date: '2026-08-16',
          reach_by_media_product_type: { POST: 5, REEL: 20 },
        }),
        // A corrupted map must not poison the sum.
        accountRow({
          metric_date: '2026-08-17',
          // WHY as: deliberately malformed jsonb to prove the zod guard drops it.
          reach_by_media_product_type: 'garbage' as unknown as null,
        }),
        accountRow({
          metric_date: '2026-08-11',
          reach_by_media_product_type: { POST: 40 },
        }),
      ],
    })
    expect(report.formats).toEqual([
      { key: 'CAROUSEL_CONTAINER', label: 'Carousels', now: 30, then: 0 },
      { key: 'REEL', label: 'Reels', now: 20, then: 0 },
      { key: 'POST', label: 'Posts', now: 15, then: 40 },
    ])
  })

  it('ranks posts by reach, tags them against the median, and names the best day', () => {
    const report = build({
      accountRows: [
        accountRow({ metric_date: '2026-08-15', reach: 100 }),
        accountRow({ metric_date: '2026-08-16', reach: 900 }),
      ],
      postRows: [
        postRow({ ig_media_id: 'a', reach: 100, posted_at: '2026-08-15T09:00:00Z' }),
        postRow({
          ig_media_id: 'b',
          reach: 600,
          posted_at: '2026-08-16T09:00:00Z',
          caption: 'Iced bar menu, day one',
        }),
        postRow({ ig_media_id: 'c', reach: 200, posted_at: '2026-08-15T15:00:00Z' }),
      ],
    })
    expect(report.posts.map((post) => post.igMediaId)).toEqual(['b', 'c', 'a'])
    expect(report.medianReach).toBe(200)
    expect(report.posts[0]!.medianRatio).toBeCloseTo(3)
    expect(report.bestDay).toEqual({
      date: '2026-08-16',
      reach: 900,
      caption: 'Iced bar menu, day one',
    })
  })

  it('turns demographics counts into shares with previous-period ticks', () => {
    const report = build({
      currentSnapshot: {
        snapshot_date: '2026-08-17',
        follower_demographics: {
          age: { '18-24': 20, '25-34': 60, '35-44': 20 },
          gender: { F: 61, M: 37, U: 2 },
          city: {
            'Varna, Varna Province': 50,
            'Sofia, Sofia-City': 30,
            'Plovdiv, X': 15,
            'Burgas, Y': 5,
          },
          country: { BG: 100 },
        },
        engaged_audience_demographics: {
          age: { '18-24': 44, '25-34': 44, '35-44': 12 },
          gender: { F: 60, M: 40 },
          city: {},
          country: {},
        },
      },
      previousSnapshot: {
        snapshot_date: '2026-08-10',
        follower_demographics: {
          age: { '18-24': 10, '25-34': 70, '35-44': 20 },
          gender: { F: 62, M: 36, U: 2 },
          city: { 'Varna, Varna Province': 60, 'Sofia, Sofia-City': 40 },
          country: { BG: 100 },
        },
        engaged_audience_demographics: null,
      },
    })
    const audience = report.audience!
    expect(audience.ages.map((band) => band.band)).toEqual(['18-24', '25-34', '35-44'])
    expect(audience.ages[0]).toEqual({
      band: '18-24',
      followerPct: 20,
      engagedPct: 44,
      prevFollowerPct: 10,
    })
    // Localized "City, Province" strings keep only the city, top 3 by share.
    expect(audience.cities.map((city) => city.label)).toEqual(['Varna', 'Sofia', 'Plovdiv'])
    expect(audience.cities[0]!.pct).toBeCloseTo(50)
    expect(audience.cities[0]!.prevPct).toBeCloseTo(60)
    expect(audience.genders[0]).toMatchObject({ label: 'Women', pct: 61 })
  })

  it('returns no audience when the snapshot is under the API floor (null jsonb)', () => {
    const report = build({
      currentSnapshot: {
        snapshot_date: '2026-08-17',
        follower_demographics: null,
        engaged_audience_demographics: null,
      },
    })
    expect(report.audience).toBeNull()
  })
})

describe('tap buttons', () => {
  it('merges bio website clicks into the funnel when the breakdown lacks them', () => {
    const report = build({
      accountRows: [
        accountRow({
          metric_date: '2026-08-15',
          website_clicks: 12,
          link_taps_by_button_type: { CALL: 3 },
        }),
        accountRow({ metric_date: '2026-08-12', website_clicks: 8 }),
      ],
    })
    expect(report.tapButtons).toEqual([
      { key: 'website_clicks', label: 'Website link', now: 12, then: 8 },
      // The previous window never carried a taps map — null, not zero.
      { key: 'CALL', label: 'Call', now: 3, then: null },
    ])
  })

  it('does not double-count when the breakdown already carries a website key', () => {
    const report = build({
      accountRows: [
        accountRow({
          metric_date: '2026-08-15',
          website_clicks: 12,
          link_taps_by_button_type: { WEBSITE: 12 },
        }),
      ],
    })
    expect(report.tapButtons).toHaveLength(1)
    expect(report.tapButtons[0]!.key).toBe('WEBSITE')
  })
})

describe('deriveFollowerCurve', () => {
  it('walks backwards from the one captured total using daily net change', () => {
    const report = build({
      accountRows: [
        accountRow({ metric_date: '2026-08-15', follows: 4, unfollows: 1 }),
        accountRow({ metric_date: '2026-08-16', follows: 2, unfollows: 0 }),
        accountRow({ metric_date: '2026-08-17', follows: 0, unfollows: 2 }),
        // The only night the sync captured the running total.
        accountRow({ metric_date: '2026-08-18', follows: 5, unfollows: 0, followers_count: 832 }),
      ],
    })
    // Each point is the total at that day's END: 832 ← −5 → 827 ← +(−2) → 829 ← −2 → 827.
    expect(report.followers.series).toEqual([827, 829, 827, 832])
    expect(report.followers.total).toBe(832)
  })

  it('breaks the line where gains are unknown instead of inventing history', () => {
    const report = build({
      accountRows: [
        // Aug 16 has no gains data — the curve must not reach past it.
        accountRow({ metric_date: '2026-08-17', follows: 3, unfollows: 0 }),
        accountRow({ metric_date: '2026-08-18', follows: 1, unfollows: 0, followers_count: 100 }),
      ],
    })
    expect(report.followers.series).toEqual([null, null, 96, 99, 100].slice(1))
  })
})

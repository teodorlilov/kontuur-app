import { describe, expect, it } from 'vitest'
import type {
  IGAccountMetricColumns,
  IGPostMetricColumns,
  PublishedPostPinColumns,
} from '@/lib/queries/select-columns'
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
    profile_links_taps: null,
    reach_by_media_product_type: null,
    interactions_by_media_product_type: null,
    link_taps_by_button_type: null,
    online_followers_by_hour: null,
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

function publishedPost(overrides: Partial<PublishedPostPinColumns>): PublishedPostPinColumns {
  return {
    id: 'p1',
    ig_media_id: null,
    caption: null,
    published_at: null,
    post_type: 'single',
    ...overrides,
  }
}

function build(input: Partial<BuildReportInput>): ReturnType<typeof buildAnalyticsReport> {
  return buildAnalyticsReport({
    period: PERIOD,
    accountRows: [],
    postRows: [],
    publishedPosts: [],
    currentSnapshot: null,
    previousSnapshot: null,
    timezone: 'UTC',
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
    // thenDate carries the previous-period day each column is measured
    // against — the axis and the day card both name it.
    expect(report.reachByDay[0]).toEqual({
      date: '2026-08-15',
      now: 150,
      then: 100,
      thenDate: '2026-08-11',
      views: 300,
      posts: [],
      thenPosts: [],
    })
    expect(report.reachByDay[3]).toEqual({
      date: '2026-08-18',
      now: 250,
      then: 100,
      thenDate: '2026-08-14',
      views: null,
      posts: [],
      thenPosts: [],
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

  it('files the comparison window’s posts on the comparison line, never in the table', () => {
    const report = build({
      postRows: [
        postRow({ ig_media_id: 'now', posted_at: '2026-08-16T09:00:00Z', reach: 200 }),
        // 11 Aug is the previous-period day that 15 Aug is measured against.
        postRow({
          ig_media_id: 'then',
          posted_at: '2026-08-11T09:00:00Z',
          reach: 900,
          caption: 'Last week',
        }),
      ],
    })
    // The table and the medians stay current-window only.
    expect(report.posts.map((post) => post.igMediaId)).toEqual(['now'])
    // …but the trend can now explain the dashed line's shape.
    expect(report.reachByDay[0]!.thenDate).toBe('2026-08-11')
    expect(report.reachByDay[0]!.thenPosts.map((post) => post.caption)).toEqual(['Last week'])
    expect(report.reachByDay[1]!.posts.map((post) => post.igMediaId)).toEqual(['now'])
    expect(report.reachByDay[1]!.thenPosts).toEqual([])
  })

  it("pins Kontuur's own published posts the sync cannot see, marked honestly", () => {
    const report = build({
      postRows: [
        postRow({ ig_media_id: 'm-live', posted_at: '2026-08-15T10:00:00+00:00', reach: 300 }),
      ],
      publishedPosts: [
        // Published well before the last sync yet absent from metrics: removed.
        publishedPost({
          id: 'gone',
          ig_media_id: '404',
          caption: 'Deleted later',
          // Naive UTC timestamp, exactly as posts.published_at stores it.
          published_at: '2026-08-16T18:57:17.192',
          post_type: 'carousel',
        }),
        // Published after the last sync: metrics simply pending.
        publishedPost({ id: 'fresh', caption: 'Fresh', published_at: '2026-08-18T09:00:00' }),
        // Already synced under the same media id: the metrics row wins.
        publishedPost({ id: 'dup', ig_media_id: 'm-live', published_at: '2026-08-15T10:00:00' }),
      ],
      lastSyncAt: '2026-08-18T03:30:00Z',
    })
    expect(report.posts).toHaveLength(3)
    const gone = report.posts.find((post) => post.igMediaId === '404')!
    expect(gone.missing).toBe('removed')
    expect(gone.mediaType).toBe('CAROUSEL_ALBUM')
    const fresh = report.posts.find((post) => post.postId === 'fresh')!
    expect(fresh.missing).toBe('pending')
    expect(fresh.igMediaId).toBe('post-fresh')
    // Each lands on its calendar day beside the synced pins.
    expect(report.reachByDay[0]!.posts.map((p) => p.igMediaId)).toEqual(['m-live'])
    expect(report.reachByDay[1]!.posts.map((p) => p.caption)).toEqual(['Deleted later'])
    expect(report.reachByDay[3]!.posts[0]!.missing).toBe('pending')
  })

  it('builds the follower flow timeline with pins, attribution and churn', () => {
    const report = build({
      accountRows: [
        accountRow({
          metric_date: '2026-08-15',
          follows: 5,
          unfollows: 2,
          followers_count: 830,
        }),
        accountRow({ metric_date: '2026-08-16', follows: 12, unfollows: 0 }),
      ],
      postRows: [
        postRow({ ig_media_id: 'a', posted_at: '2026-08-16T09:00:00Z', reach: 200, follows: 4 }),
        postRow({ ig_media_id: 'b', posted_at: '2026-08-16T18:00:00Z', reach: 100, follows: null }),
      ],
    })
    expect(report.followers.byDay.map((d) => d.gained)).toEqual([5, 12, null, null])
    expect(report.followers.byDay.map((d) => d.posts.length)).toEqual([0, 2, 0, 0])
    // The flow day names its posts, strongest reach first — the hover card reads them.
    expect(report.followers.byDay[1]!.posts.map((p) => p.igMediaId)).toEqual(['a', 'b'])
    // Instagram's own per-media attribution; the null-follows post doesn't poison it.
    expect(report.followers.fromPosts).toBe(4)
    // Start = first anchored total (830) minus that day's net (+3) → 827; lost 2 of 827.
    expect(report.followers.churnPct).toBeCloseTo((2 / 827) * 100)
  })

  it('builds the conversion funnel with rates on honest denominators', () => {
    const report = build({
      accountRows: [
        accountRow({
          metric_date: '2026-08-15',
          reach: 1000,
          profile_views: 40,
          profile_links_taps: 3,
          website_clicks: 2,
          follows: 9,
        }),
        accountRow({
          metric_date: '2026-08-12',
          reach: 500,
          profile_views: 20,
          profile_links_taps: 1,
          follows: 4,
        }),
      ],
    })
    const [reached, views, taps, follows] = report.funnel
    expect(reached).toMatchObject({ now: 1000, then: 500, per100: null })
    expect(views).toMatchObject({
      now: 40,
      then: 20,
      per100: 4,
      rateBasis: 'per 100 accounts reached',
    })
    // Link taps and the separate website_clicks column sum into one stage.
    expect(taps).toMatchObject({ now: 5, then: 1, rateBasis: 'per 100 profile visits' })
    expect(taps!.per100).toBeCloseTo(12.5)
    // Follows rate against profile views, NEVER per tap — most follows skip links.
    expect(follows).toMatchObject({ now: 9, then: 4, rateBasis: 'per 100 profile visits' })
    expect(follows!.per100).toBeCloseTo(22.5)
  })

  it('enriches formats with published counts and ER only on a solid base', () => {
    const report = build({
      accountRows: [
        accountRow({
          metric_date: '2026-08-15',
          reach_by_media_product_type: { POST: 1500, REEL: 400, CAROUSEL_CONTAINER: 800, AD: 5000 },
          interactions_by_media_product_type: { POST: 90, REEL: 30, AD: 25 },
        }),
      ],
      postRows: [
        postRow({
          ig_media_id: 'a',
          posted_at: '2026-08-15T10:00:00Z',
          media_product_type: 'FEED',
          media_type: 'IMAGE',
        }),
        postRow({
          ig_media_id: 'b',
          posted_at: '2026-08-16T10:00:00Z',
          // Carousel bridges from media_type, not media_product_type.
          media_product_type: 'FEED',
          media_type: 'CAROUSEL_ALBUM',
        }),
        postRow({
          ig_media_id: 'c',
          posted_at: '2026-08-16T11:00:00Z',
          media_product_type: 'REELS',
          media_type: 'VIDEO',
        }),
      ],
    })
    expect(report.formats.find((row) => row.key === 'POST')!.meta).toBe('1 published · 6.0% ER')
    // Reach 400 sits under the 1,000 floor: the count shows, the rate stays unprinted.
    expect(report.formats.find((row) => row.key === 'REEL')!.meta).toBe('1 published')
    expect(report.formats.find((row) => row.key === 'CAROUSEL_CONTAINER')!.meta).toBe('1 published')
    // Ads are never in /media, so they say why there is no count rather than
    // leaving a gap beside neighbours that all carry one.
    expect(report.formats.find((row) => row.key === 'AD')!.meta).toBe(
      'not listed post by post · 0.5% ER'
    )
  })

  it('never rounds a real engagement rate down to a measured zero', () => {
    const report = build({
      accountRows: [
        accountRow({
          metric_date: '2026-08-15',
          reach_by_media_product_type: { AD: 32340, STORY: 4000 },
          // 15 / 32,340 is 0.046% — toFixed(1) would print "0.0% ER" and read
          // as "the ads earned nothing", which is a different claim.
          interactions_by_media_product_type: { AD: 15, STORY: 0 },
        }),
      ],
    })
    expect(report.formats.find((row) => row.key === 'AD')!.meta).toBe(
      'not listed post by post · <0.1% ER'
    )
    // A measured zero is allowed to say so, in words rather than as "0.0%".
    expect(report.formats.find((row) => row.key === 'STORY')!.meta).toBe(
      'not listed post by post · no interactions'
    )
  })

  it('sorts interaction kinds by size and carries their share of interactions', () => {
    const report = build({
      accountRows: [
        accountRow({
          metric_date: '2026-08-15',
          total_interactions: 400,
          likes: 300,
          comments: 0,
          saves: 52,
          shares: 40,
          replies: 8,
        }),
      ],
    })
    expect(report.interactionKinds.map((row) => row.key)).toEqual([
      'likes',
      'saves',
      'shares',
      'replies',
      'comments',
    ])
    expect(report.interactionKinds[0]).toMatchObject({
      label: 'Likes',
      now: 300,
      meta: '75% of interactions',
    })
    // A measured zero keeps its row — and carries no share line.
    const comments = report.interactionKinds.find((row) => row.key === 'comments')!
    expect(comments).toMatchObject({ now: 0, then: null })
    expect(comments.meta).toBeUndefined()
  })

  it('converts Pacific-anchored online hours into the agency clock, gated on sample size', () => {
    // 2026-08-15 is a Saturday. Hour 14 in America/Los_Angeles (PDT, UTC-7)
    // is 21:00 UTC the same day.
    // The maps ride the ordinary account rows — the whole fetched span
    // (previous window included) counts as evidence.
    const day = (date: string) =>
      accountRow({ metric_date: date, online_followers_by_hour: { '14': 100 } })
    const fiveDays = ['2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15'].map(day)

    const gated = build({ accountRows: fiveDays.slice(0, 4) })
    expect(gated.audienceOnline).toBeNull()

    const report = build({ accountRows: fiveDays })
    const online = report.audienceOnline!
    expect(online.sampleDays).toBe(5)
    // Saturday (index 5) at 21:00 UTC carries the 15 Aug sample.
    expect(online.grid[5]![21]).toBe(100)
    expect(online.grid[5]![14]).toBe(0)
    expect(online.peaks[0]).toMatchObject({ hour: 21, avg: 100 })
  })

  it('buckets publish windows by agency-local hour with medians, skipping unsynced posts', () => {
    const report = build({
      postRows: [
        postRow({ ig_media_id: 'a', posted_at: '2026-08-15T07:00:00+00:00', reach: 100 }),
        postRow({ ig_media_id: 'b', posted_at: '2026-08-16T08:30:00+00:00', reach: 300 }),
        postRow({ ig_media_id: 'c', posted_at: '2026-08-17T09:00:00+00:00', reach: 200 }),
        postRow({ ig_media_id: 'd', posted_at: '2026-08-17T18:00:00+00:00', reach: 900 }),
        // Reach unknown: contributes nothing to any bucket.
        postRow({ ig_media_id: 'e', posted_at: '2026-08-18T07:30:00+00:00', reach: null }),
      ],
    })
    const morning = report.publishWindows.find((bucket) => bucket.key === 'morning')!
    expect(morning.postCount).toBe(3)
    expect(morning.medianReach).toBe(200)
    // Overall median across a,b,c,d = 250 → morning at 0.8×.
    expect(morning.vsMedian).toBeCloseTo(200 / 250)
    const evening = report.publishWindows.find((bucket) => bucket.key === 'evening')!
    expect(evening.postCount).toBe(1)
    expect(report.publishWindows.find((bucket) => bucket.key === 'night')!.postCount).toBe(0)
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
      // 44% of engagement from 20% of followers: engaging at 2.2× its share.
      engagedIndex: 2.2,
    })
    // Localized "City, Province" strings keep only the city, top 3 by share.
    expect(audience.cities.map((city) => city.label)).toEqual(['Varna', 'Sofia', 'Plovdiv'])
    expect(audience.cities[0]!.pct).toBeCloseTo(50)
    expect(audience.cities[0]!.prevPct).toBeCloseTo(60)
    expect(audience.genders[0]).toMatchObject({ label: 'Women', pct: 61 })
    // ISO country codes spell out as names.
    expect(audience.countries).toEqual([{ label: 'Bulgaria', pct: 100, prevPct: 100 }])
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

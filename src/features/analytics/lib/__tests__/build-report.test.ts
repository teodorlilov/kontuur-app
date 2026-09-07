import { describe, expect, it } from 'vitest'
import type {
  IGAccountMetricColumns,
  PlatformPostMetricColumns,
} from '@/lib/queries/select-columns'
import {
  buildAnalyticsReport,
  deltaPct,
  humanizeDimension,
  sumOrNull,
  type BuildReportInput,
} from '../instagram/build-report'
import type { AnalyticsPeriod } from '../compute/period'
import { postMetricRow, publishedPost } from './fixtures'

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
    ...overrides,
  }
}

/** Instagram's defaults over the shared skeleton: a plain feed image unless a case says so. */
function postRow(overrides: Partial<PlatformPostMetricColumns>): PlatformPostMetricColumns {
  return postMetricRow({ media_type: 'IMAGE', media_product_type: 'FEED', ...overrides })
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
  /**
   * The rule every capture is written to: NULL is "the API had nothing", 0 is "the API said 0".
   * Collapsing them is the Graph API's silent-empty-200 failure mode.
   */
  it('is null only when every input was null', () => {
    expect(sumOrNull([])).toBeNull()
    expect(sumOrNull([null, null])).toBeNull()
    expect(sumOrNull([null, 2, 3])).toBe(5)
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
  /**
   * Pairs align by INDEX, not by date — day 1 of now against day 1 of then — and `thenDate`
   * carries the day the comparison value came from, because the axis and the day card print it.
   */
  it('sums both periods, keeps day alignment, and leaves missing days null', () => {
    const report = build({
      accountRows: [
        accountRow({ metric_date: '2026-08-11', reach: 100, views: 200 }),
        accountRow({ metric_date: '2026-08-14', reach: 100, views: 200 }),
        accountRow({ metric_date: '2026-08-15', reach: 150, views: 300 }),
        accountRow({ metric_date: '2026-08-17', reach: null, views: 100 }),
        accountRow({ metric_date: '2026-08-18', reach: 250, views: null }),
      ],
    })
    expect(report.reach.now).toBe(400)
    expect(report.reach.then).toBe(200)
    expect(report.reach.deltaPct).toBeCloseTo(100)
    expect(report.reach.series).toEqual([150, null, null, 250])
    expect(report.views.now).toBe(400)
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

  /** The third row has no timestamp, so there is no day to pin it to — the table still lists it. */
  it('pins each publication onto its calendar day, strongest reach first', () => {
    const report = build({
      postRows: [
        postRow({
          external_post_id: 'a',
          posted_at: '2026-08-16T09:00:00Z',
          reach: 200,
          caption: 'Small',
        }),
        postRow({
          external_post_id: 'b',
          posted_at: '2026-08-16T18:00:00Z',
          reach: 900,
          follows: 3,
          caption: 'Big',
        }),
        postRow({ external_post_id: 'c', posted_at: null, reach: 500 }),
      ],
    })
    const day = report.reachByDay[1]!
    expect(day.posts.map((post) => post.externalPostId)).toEqual(['b', 'a'])
    expect(day.posts[0]).toMatchObject({ caption: 'Big', reach: 900, follows: 3 })
    expect(report.reachByDay[0]!.posts).toEqual([])
    expect(report.reachByDay.flatMap((d) => d.posts).some((p) => p.externalPostId === 'c')).toBe(
      false
    )
    expect(report.posts).toHaveLength(3)
  })

  /**
   * 11 Aug is the previous-period day 15 Aug is measured against, and its post is reachable only
   * through `thenPosts` — so the dashed line can be explained without the table claiming a post
   * from outside its own window.
   */
  it('files the comparison window’s posts on the comparison line, never in the table', () => {
    const report = build({
      postRows: [
        postRow({ external_post_id: 'now', posted_at: '2026-08-16T09:00:00Z', reach: 200 }),
        postRow({
          external_post_id: 'then',
          posted_at: '2026-08-11T09:00:00Z',
          reach: 900,
          caption: 'Last week',
        }),
      ],
    })
    expect(report.posts.map((post) => post.externalPostId)).toEqual(['now'])
    expect(report.reachByDay[0]!.thenDate).toBe('2026-08-11')
    expect(report.reachByDay[0]!.thenPosts.map((post) => post.caption)).toEqual(['Last week'])
    expect(report.reachByDay[1]!.posts.map((post) => post.externalPostId)).toEqual(['now'])
    expect(report.reachByDay[1]!.thenPosts).toEqual([])
  })

  /**
   * The three ledger cases: published well before the last sync yet absent from metrics
   * (removed), published after that sync (metrics merely pending), and one already synced under
   * the same media id, where the metrics row wins and the pin defers.
   */
  it("pins Kontuur's own published posts the sync cannot see, marked honestly", () => {
    const report = build({
      postRows: [
        postRow({ external_post_id: 'm-live', posted_at: '2026-08-15T10:00:00+00:00', reach: 300 }),
      ],
      publishedPosts: [
        publishedPost({
          id: 'gone',
          external_post_id: '404',
          caption: 'Deleted later',
          published_at: '2026-08-16T18:57:17.192',
          post_type: 'carousel',
        }),
        publishedPost({ id: 'fresh', caption: 'Fresh', published_at: '2026-08-18T09:00:00' }),
        publishedPost({
          id: 'dup',
          external_post_id: 'm-live',
          published_at: '2026-08-15T10:00:00',
        }),
      ],
      lastSyncAt: '2026-08-18T03:30:00Z',
    })
    expect(report.posts).toHaveLength(3)
    const gone = report.posts.find((post) => post.externalPostId === '404')!
    expect(gone.missing).toBe('removed')
    expect(gone.mediaType).toBe('CAROUSEL_ALBUM')
    const fresh = report.posts.find((post) => post.postId === 'fresh')!
    expect(fresh.missing).toBe('pending')
    expect(fresh.externalPostId).toBe('post-fresh')
    expect(report.reachByDay[0]!.posts.map((p) => p.externalPostId)).toEqual(['m-live'])
    expect(report.reachByDay[1]!.posts.map((p) => p.caption)).toEqual(['Deleted later'])
    expect(report.reachByDay[3]!.posts[0]!.missing).toBe('pending')
  })

  /**
   * Sofia is UTC+3, so 22:30Z on the 14th is 01:30 on the 15th locally — the window's opening
   * day, and its first column rather than off the left edge. Slicing the UTC prefix instead of
   * bucketing through the agency timezone drops this row out of the window, and the ledger arm
   * then re-adds it as a pin marked "removed": a live post reported as deleted from Instagram.
   */
  it('buckets posts by the agency calendar day, not the UTC one', () => {
    const report = build({
      timezone: 'Europe/Sofia',
      postRows: [
        postRow({
          external_post_id: 'early',
          caption: 'Just after local midnight',
          posted_at: '2026-08-14T22:30:00+00:00',
          reach: 300,
        }),
      ],
      publishedPosts: [
        publishedPost({
          id: 'early-ledger',
          external_post_id: 'early',
          published_at: '2026-08-14T22:30:00',
        }),
      ],
      lastSyncAt: '2026-08-18T03:30:00Z',
    })

    expect(report.posts).toHaveLength(1)
    expect(report.posts[0]!.missing).toBeNull()
    expect(report.posts[0]!.postedDayKey).toBe('2026-08-15')
    expect(report.reachByDay[0]!.posts.map((post) => post.externalPostId)).toEqual(['early'])
    expect(report.reachByDay[0]!.thenPosts).toEqual([])
  })

  /** The other edge: 21:00Z on the 16th is already 00:00 on the 17th in Sofia. */
  it('keeps a late-evening post on its own local day', () => {
    const report = build({
      timezone: 'Europe/Sofia',
      postRows: [
        postRow({ external_post_id: 'late', posted_at: '2026-08-16T21:00:00+00:00', reach: 120 }),
      ],
    })
    expect(report.posts[0]!.postedDayKey).toBe('2026-08-17')
    expect(report.reachByDay[1]!.posts).toEqual([])
    expect(report.reachByDay[2]!.posts.map((post) => post.externalPostId)).toEqual(['late'])
  })

  /**
   * A day card lists its top few posts, so their order decides which. Attribution is Instagram's
   * own per-media figure, where a null-follows post contributes nothing rather than a zero. The
   * churn base is the walked start: 830 minus that day's net +3 = 827, of which 2 were lost.
   */
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
        postRow({
          external_post_id: 'a',
          posted_at: '2026-08-16T09:00:00Z',
          reach: 200,
          follows: 4,
        }),
        postRow({
          external_post_id: 'b',
          posted_at: '2026-08-16T18:00:00Z',
          reach: 100,
          follows: null,
        }),
      ],
    })
    expect(report.followers.byDay.map((d) => d.gained)).toEqual([5, 12, null, null])
    expect(report.followers.byDay.map((d) => d.posts.length)).toEqual([0, 2, 0, 0])
    expect(report.followers.byDay[1]!.posts.map((p) => p.externalPostId)).toEqual(['a', 'b'])
    expect(report.followers.fromPosts).toBe(4)
    expect(report.followers.churnPct).toBeCloseTo((2 / 827) * 100)
  })

  /**
   * Link taps and the separate `website_clicks` column sum into one stage, and the follows rate
   * divides by profile views, NEVER per tap: most follows never touch a link, so a per-tap
   * denominator would invent a conversion the account did not have.
   */
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
    expect(taps).toMatchObject({ now: 5, then: 1, rateBasis: 'per 100 profile visits' })
    expect(taps!.per100).toBeCloseTo(12.5)
    expect(follows).toMatchObject({ now: 9, then: 4, rateBasis: 'per 100 profile visits' })
    expect(follows!.per100).toBeCloseTo(22.5)
  })

  /**
   * Carousels bridge from `media_type`, not `media_product_type`. Reels sit at 400 reached,
   * under the 1,000 RATE_BASE_FLOOR, so the count prints and the rate does not. Ads have no
   * media rows of ours at all, and the SECTION is where that is explained — the row itself
   * carries only facts about the account, never an apology for our data source.
   */
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
          external_post_id: 'a',
          posted_at: '2026-08-15T10:00:00Z',
          media_product_type: 'FEED',
          media_type: 'IMAGE',
        }),
        postRow({
          external_post_id: 'b',
          posted_at: '2026-08-16T10:00:00Z',
          media_product_type: 'FEED',
          media_type: 'CAROUSEL_ALBUM',
        }),
        postRow({
          external_post_id: 'c',
          posted_at: '2026-08-16T11:00:00Z',
          media_product_type: 'REELS',
          media_type: 'VIDEO',
        }),
      ],
    })
    expect(report.formats.find((row) => row.key === 'POST')!.meta).toBe(
      '1 published · 6.0% engagement rate'
    )
    expect(report.formats.find((row) => row.key === 'REEL')!.meta).toBe('1 published')
    expect(report.formats.find((row) => row.key === 'CAROUSEL_CONTAINER')!.meta).toBe('1 published')
    expect(report.formats.find((row) => row.key === 'AD')!.meta).toBe('0.5% engagement rate')
  })

  /**
   * Instagram omits CAROUSEL_CONTAINER from its breakdown, and its POST figures divide to an
   * impossible 127% (356 over 279) — the two counted on different bases. So carousels are rated
   * from our own rows, 220 interactions over 1,600 reached; and POST, which also has media rows,
   * never falls back to that 127%: our own sample is under the floor, and no rate is the honest
   * answer.
   */
  it('does its own arithmetic for the formats Instagram itemises', () => {
    const report = build({
      accountRows: [
        accountRow({
          metric_date: '2026-08-15',
          reach_by_media_product_type: { POST: 279, CAROUSEL_CONTAINER: 1842 },
          interactions_by_media_product_type: { POST: 356 },
        }),
      ],
      postRows: [
        postRow({
          external_post_id: 'c1',
          posted_at: '2026-08-15T09:00:00Z',
          media_product_type: 'FEED',
          media_type: 'CAROUSEL_ALBUM',
          reach: 1000,
          total_interactions: 130,
        }),
        postRow({
          external_post_id: 'c2',
          posted_at: '2026-08-16T09:00:00Z',
          media_product_type: 'FEED',
          media_type: 'CAROUSEL_ALBUM',
          reach: 600,
          total_interactions: 90,
        }),
      ],
    })
    expect(report.formats.find((row) => row.key === 'CAROUSEL_CONTAINER')!.meta).toBe(
      '2 published · 13.8% engagement rate'
    )
    expect(report.formats.find((row) => row.key === 'POST')!.meta).toBeUndefined()
  })

  /**
   * Day two captured reach but not interactions — the consolidation lag a naive window-total ÷
   * window-total would divide straight through. Reach still totals the whole window, while the
   * rate divides 20 by the 4,000 measured beside it (0.5%), never by 6,000 (0.3%), which no day
   * ever observed.
   */
  it('rates a format on the days that measured both halves, not the window total', () => {
    const report = build({
      accountRows: [
        accountRow({
          metric_date: '2026-08-15',
          reach_by_media_product_type: { AD: 4000 },
          interactions_by_media_product_type: { AD: 20 },
        }),
        accountRow({ metric_date: '2026-08-16', reach_by_media_product_type: { AD: 2000 } }),
      ],
    })
    const ad = report.formats.find((row) => row.key === 'AD')!
    expect(ad.now).toBe(6000)
    expect(ad.meta).toBe('0.5% engagement rate')
  })

  /**
   * One rated day (5,000) against a 32,000 window is 16% coverage, under the 50%
   * PAIRED_COVERAGE_FLOOR, so the rate cannot stand for the period. The reach still totals and
   * renders; only the rate is withheld.
   */
  it('withholds the rate when the paired days are a corner of the period', () => {
    const report = build({
      accountRows: [
        accountRow({
          metric_date: '2026-08-15',
          reach_by_media_product_type: { AD: 5000 },
          interactions_by_media_product_type: { AD: 25 },
        }),
        accountRow({ metric_date: '2026-08-16', reach_by_media_product_type: { AD: 27000 } }),
      ],
    })
    expect(report.formats.find((row) => row.key === 'AD')!.now).toBe(32000)
    expect(report.formats.find((row) => row.key === 'AD')!.meta).toBeUndefined()
  })

  /**
   * 15 over 32,340 is 0.046%: `toFixed(1)` would print "0.0% ER" and read as "the ads earned
   * nothing", which is a different claim. A measured zero may say so — in words, not as "0.0%".
   */
  it('never rounds a real engagement rate down to a measured zero', () => {
    const report = build({
      accountRows: [
        accountRow({
          metric_date: '2026-08-15',
          reach_by_media_product_type: { AD: 32340, STORY: 4000 },
          interactions_by_media_product_type: { AD: 15, STORY: 0 },
        }),
      ],
    })
    expect(report.formats.find((row) => row.key === 'AD')!.meta).toBe('under 0.1% engagement rate')
    expect(report.formats.find((row) => row.key === 'STORY')!.meta).toBe('no interactions')
  })

  /** A measured zero keeps its row; "0% of interactions" would be noise, so it gets no share. */
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
    const comments = report.interactionKinds.find((row) => row.key === 'comments')!
    expect(comments).toMatchObject({ now: 0, then: null })
    expect(comments.meta).toBeUndefined()
  })

  /**
   * The stored hour keys are Pacific-anchored (build-report.ts records the probe). 2026-08-15 is
   * a Saturday, and hour 14 in PDT (UTC-7) is 21:00 UTC the same day — hence grid[5][21]. The
   * maps ride the ordinary account rows, so the previous window counts as evidence too, which is
   * what carries this fixture over MIN_ONLINE_DAYS.
   */
  it('converts Pacific-anchored online hours into the agency clock, gated on sample size', () => {
    const day = (date: string) =>
      accountRow({ metric_date: date, online_followers_by_hour: { '14': 100 } })
    const fiveDays = ['2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15'].map(day)

    const gated = build({ accountRows: fiveDays.slice(0, 4) })
    expect(gated.audienceOnline).toBeNull()

    const report = build({ accountRows: fiveDays })
    const online = report.audienceOnline!
    expect(online.sampleDays).toBe(5)
    expect(online.grid[5]![21]).toBe(100)
    expect(online.grid[5]![14]).toBe(0)
    expect(online.peaks[0]).toMatchObject({ hour: 21, avg: 100 })
  })

  /**
   * A post whose reach is unknown contributes to no bucket. The overall median across the four
   * measured posts is 250 and morning's own is 200, so morning reads 0.8×.
   */
  it('buckets publish windows by agency-local hour with medians, skipping unsynced posts', () => {
    const report = build({
      postRows: [
        postRow({ external_post_id: 'a', posted_at: '2026-08-15T07:00:00+00:00', reach: 100 }),
        postRow({ external_post_id: 'b', posted_at: '2026-08-16T08:30:00+00:00', reach: 300 }),
        postRow({ external_post_id: 'c', posted_at: '2026-08-17T09:00:00+00:00', reach: 200 }),
        postRow({ external_post_id: 'd', posted_at: '2026-08-17T18:00:00+00:00', reach: 900 }),
        postRow({ external_post_id: 'e', posted_at: '2026-08-18T07:30:00+00:00', reach: null }),
      ],
    })
    const morning = report.publishWindows.find((bucket) => bucket.key === 'morning')!
    expect(morning.postCount).toBe(3)
    expect(morning.medianReach).toBe(200)
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

  /** The total is the latest one captured in the window, not the period's first. */
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

  /**
   * WHY as: the third row's jsonb is deliberately malformed, to prove the zod guard drops it —
   * a corrupted map must neither poison the sum nor throw.
   */
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
        accountRow({
          metric_date: '2026-08-17',
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
        postRow({ external_post_id: 'a', reach: 100, posted_at: '2026-08-15T09:00:00Z' }),
        postRow({
          external_post_id: 'b',
          reach: 600,
          posted_at: '2026-08-16T09:00:00Z',
          caption: 'Iced bar menu, day one',
        }),
        postRow({ external_post_id: 'c', reach: 200, posted_at: '2026-08-15T15:00:00Z' }),
      ],
    })
    expect(report.posts.map((post) => post.externalPostId)).toEqual(['b', 'c', 'a'])
    expect(report.medianReach).toBe(200)
    expect(report.posts[0]!.medianRatio).toBeCloseTo(3)
    expect(report.bestDay).toEqual({
      date: '2026-08-16',
      reach: 900,
      caption: 'Iced bar menu, day one',
    })
  })

  /**
   * The engaged index is a ratio of shares: 44% of engagement from 20% of followers is 2.2× that
   * band's share of the audience. Localized "City, Province" strings keep only the city, top 3.
   */
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
      engagedIndex: 2.2,
    })
    expect(audience.cities.map((city) => city.label)).toEqual(['Varna', 'Sofia', 'Plovdiv'])
    expect(audience.cities[0]!.pct).toBeCloseTo(50)
    expect(audience.cities[0]!.prevPct).toBeCloseTo(60)
    expect(audience.genders[0]).toMatchObject({ label: 'Women', pct: 61 })
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
  /** The previous window carried no taps map at all, so CALL's `then` is null rather than zero. */
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
  /**
   * Each point is the total at that day's END, walked back from the single captured total:
   * 832 − 5 = 827, 827 − (0−2) = 829, 829 − 2 = 827.
   */
  it('walks backwards from the one captured total using daily net change', () => {
    const report = build({
      accountRows: [
        accountRow({ metric_date: '2026-08-15', follows: 4, unfollows: 1 }),
        accountRow({ metric_date: '2026-08-16', follows: 2, unfollows: 0 }),
        accountRow({ metric_date: '2026-08-17', follows: 0, unfollows: 2 }),
        accountRow({ metric_date: '2026-08-18', follows: 5, unfollows: 0, followers_count: 832 }),
      ],
    })
    expect(report.followers.series).toEqual([827, 829, 827, 832])
    expect(report.followers.total).toBe(832)
  })

  it('breaks the line where gains are unknown instead of inventing history', () => {
    const report = build({
      accountRows: [
        accountRow({ metric_date: '2026-08-17', follows: 3, unfollows: 0 }),
        accountRow({ metric_date: '2026-08-18', follows: 1, unfollows: 0, followers_count: 100 }),
      ],
    })
    expect(report.followers.series).toEqual([null, null, 96, 99, 100].slice(1))
  })
})

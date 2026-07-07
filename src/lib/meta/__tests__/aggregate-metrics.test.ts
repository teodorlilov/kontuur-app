import { describe, it, expect } from 'vitest'
import type { IGPost } from '@/types/api'
import {
  deltaPct,
  buildAudienceDemographics,
  pivotIGInsights,
  pivotFBInsights,
  sumIGDailyInsights,
  computeNetChangeFromSnapshots,
  computeIGPostAggregates,
  computeIGMediaTypeBreakdown,
  buildIGSummary,
} from '../aggregate-metrics'

function makeIGPost(overrides: Partial<IGPost> = {}): IGPost {
  return {
    id: '1',
    caption: null,
    timestamp: '2026-07-01T10:00:00+0000',
    media_type: 'IMAGE',
    like_count: 0,
    comments_count: 0,
    ...overrides,
  }
}

describe('deltaPct', () => {
  it('computes a rounded percentage delta', () => {
    expect(deltaPct(150, 100)).toBe(50)
    expect(deltaPct(90, 100)).toBe(-10)
    expect(deltaPct(100, 100)).toBe(0)
  })

  it('returns null when there is no baseline', () => {
    expect(deltaPct(100, 0)).toBeNull()
    expect(deltaPct(0, 0)).toBeNull()
  })
})

describe('buildAudienceDemographics', () => {
  const data = [
    { name: 'audience_gender_age', values: [{ value: { 'F.25-34': 120, 'M.25-34': 80 } }] },
    {
      name: 'audience_city',
      values: [{ value: { Sofia: 50, Plovdiv: 30, Varna: 20, Burgas: 10, Ruse: 5, Vidin: 1 } }],
    },
    { name: 'audience_country', values: [{ value: { BG: 180, DE: 20 } }] },
  ]

  it('builds gender/age plus top-5 cities and countries sorted by value', () => {
    const result = buildAudienceDemographics(
      data,
      'audience_gender_age',
      'audience_city',
      'audience_country'
    )
    expect(result).not.toBeNull()
    expect(result!.gender_age).toEqual({ 'F.25-34': 120, 'M.25-34': 80 })
    expect(result!.top_cities).toHaveLength(5)
    expect(result!.top_cities[0]).toEqual({ name: 'Sofia', value: 50 })
    expect(result!.top_countries).toEqual([
      { name: 'BG', value: 180 },
      { name: 'DE', value: 20 },
    ])
  })

  it('returns null when gender/age data is missing', () => {
    const result = buildAudienceDemographics(
      data,
      'missing_metric',
      'audience_city',
      'audience_country'
    )
    expect(result).toBeNull()
  })
})

describe('pivotIGInsights', () => {
  it('pivots per-metric arrays into per-day records sorted by date', () => {
    const result = pivotIGInsights([
      {
        name: 'reach',
        values: [
          { value: 20, end_time: '2026-07-02T07:00:00+0000' },
          { value: 10, end_time: '2026-07-01T07:00:00+0000' },
        ],
      },
      { name: 'profile_views', values: [{ value: 5, end_time: '2026-07-01T07:00:00+0000' }] },
    ])
    expect(result).toEqual([
      { date: '2026-07-01', reach: 10, profile_views: 5 },
      { date: '2026-07-02', reach: 20 },
    ])
  })

  it("maps the API's 'views' metric to 'impressions'", () => {
    const result = pivotIGInsights([
      { name: 'views', values: [{ value: 42, end_time: '2026-07-01T07:00:00+0000' }] },
    ])
    expect(result[0]).toEqual({ date: '2026-07-01', impressions: 42 })
  })

  it('splits follows_and_unfollows into follows and unfollows fields', () => {
    const result = pivotIGInsights([
      {
        name: 'follows_and_unfollows',
        values: [{ value: { follow: 7, unfollow: 2 }, end_time: '2026-07-01T07:00:00+0000' }],
      },
    ])
    expect(result[0]).toEqual({ date: '2026-07-01', follows: 7, unfollows: 2 })
  })
})

describe('pivotFBInsights', () => {
  it('renames page metrics to internal keys and drops unknown metrics', () => {
    const result = pivotFBInsights([
      { name: 'page_impressions', values: [{ value: 100, end_time: '2026-07-01T07:00:00+0000' }] },
      { name: 'page_fan_adds', values: [{ value: 3, end_time: '2026-07-01T07:00:00+0000' }] },
      { name: 'unknown_metric', values: [{ value: 9, end_time: '2026-07-01T07:00:00+0000' }] },
    ])
    expect(result).toEqual([{ date: '2026-07-01', impressions: 100, fan_adds: 3 }])
  })
})

describe('sumIGDailyInsights', () => {
  it('sums each metric across days, treating missing values as zero', () => {
    const sums = sumIGDailyInsights([
      { date: '2026-07-01', reach: 10, impressions: 100, follows: 2 },
      { date: '2026-07-02', reach: 20, profile_views: 5, unfollows: 1 },
    ])
    expect(sums).toEqual({
      totalReach: 30,
      totalImpressions: 100,
      totalProfileViews: 5,
      totalAccountsEngaged: 0,
      totalWebsiteClicks: 0,
      totalFollows: 2,
      totalUnfollows: 1,
    })
  })
})

describe('computeNetChangeFromSnapshots', () => {
  it('derives net change from first and last positive follower_count', () => {
    const net = computeNetChangeFromSnapshots([
      { date: '2026-07-01', follower_count: 100 },
      { date: '2026-07-02', follower_count: 0 },
      { date: '2026-07-03', follower_count: 108 },
    ])
    expect(net).toBe(8)
  })

  it('returns 0 with fewer than two usable snapshots', () => {
    expect(computeNetChangeFromSnapshots([{ date: '2026-07-01', follower_count: 100 }])).toBe(0)
    expect(computeNetChangeFromSnapshots([])).toBe(0)
  })
})

describe('computeIGPostAggregates', () => {
  it('computes engagement rate, saves, save rate, and shares', () => {
    const posts = [
      makeIGPost({ like_count: 80, comments_count: 20, saved: 5, reach: 500, shares: 3 }),
      makeIGPost({ like_count: 40, comments_count: 10, saved: 5, reach: 500, shares: 2 }),
    ]
    const agg = computeIGPostAggregates(posts, 1000)
    // (150 engagements / 2 posts / 1000 followers) * 100 = 7.5%
    expect(agg.avgEngagementRate).toBe(7.5)
    expect(agg.totalSaved).toBe(10)
    // 10 saved / 1000 reach = 1%
    expect(agg.avgSaveRate).toBe(1)
    expect(agg.totalShares).toBe(5)
  })

  it('returns zeros for an empty post list', () => {
    const agg = computeIGPostAggregates([], 1000)
    expect(agg).toEqual({ avgEngagementRate: 0, totalSaved: 0, avgSaveRate: 0, totalShares: 0 })
  })
})

describe('computeIGMediaTypeBreakdown', () => {
  it('groups by media type and sorts by engagement rate descending', () => {
    const posts = [
      makeIGPost({ media_type: 'IMAGE', like_count: 10, comments_count: 0, reach: 100 }),
      makeIGPost({ media_type: 'REELS', like_count: 30, comments_count: 0, reach: 100 }),
    ]
    const breakdown = computeIGMediaTypeBreakdown(posts, 1000)
    expect(breakdown).toEqual([
      { type: 'REELS', avg_engagement_rate: 30, count: 1 },
      { type: 'IMAGE', avg_engagement_rate: 10, count: 1 },
    ])
  })

  it('falls back to follower count when a post has no reach', () => {
    const posts = [makeIGPost({ media_type: 'IMAGE', like_count: 50, comments_count: 0 })]
    const breakdown = computeIGMediaTypeBreakdown(posts, 1000)
    expect(breakdown[0]!.avg_engagement_rate).toBe(5)
  })
})

describe('buildIGSummary', () => {
  const emptyDeltas = {
    reach: 0, impressions: 0, profileViews: 0,
    newFollowers: 0, unfollowers: 0, accountsEngaged: 0, websiteClicks: 0,
  }

  it('uses follows/unfollows for net change when the API provided them', () => {
    const sums = sumIGDailyInsights([{ date: '2026-07-01', follows: 10, unfollows: 3 }])
    const summary = buildIGSummary(sums, computeIGPostAggregates([], 1), 0, emptyDeltas, [])
    expect(summary.net_follower_change).toBe(7)
  })

  it('falls back to follower_count snapshots when follows are unavailable', () => {
    const daily = [
      { date: '2026-07-01', follower_count: 100 },
      { date: '2026-07-02', follower_count: 112 },
    ]
    const sums = sumIGDailyInsights(daily)
    const summary = buildIGSummary(sums, computeIGPostAggregates([], 1), 0, emptyDeltas, daily)
    expect(summary.net_follower_change).toBe(12)
  })

  it('computes deltas against the previous period', () => {
    const sums = sumIGDailyInsights([{ date: '2026-07-01', reach: 150, website_clicks: 20 }])
    const summary = buildIGSummary(
      sums,
      computeIGPostAggregates([], 1),
      3,
      { ...emptyDeltas, reach: 100, websiteClicks: 40 },
      []
    )
    expect(summary.reach_delta_pct).toBe(50)
    expect(summary.website_clicks_delta_pct).toBe(-50)
    // No baseline for the other deltas
    expect(summary.views_delta_pct).toBeNull()
    expect(summary.posts_published).toBe(3)
  })
})

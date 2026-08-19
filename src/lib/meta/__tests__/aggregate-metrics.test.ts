import { describe, it, expect } from 'vitest'
import type { IGPost } from '@/types/api'
import type { IGDayTotals, IGDemographics } from '../insights'
import {
  type IGPeriodStats,
  buildAudienceFromDemographics,
  buildDailyInsights,
  buildIGSummary,
  computeIGMediaTypeBreakdown,
  computeIGPostAggregates,
  deltaPct,
  deriveCumulativeFollowerSeries,
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

const nullTotals: IGDayTotals = {
  views: null,
  accounts_engaged: null,
  total_interactions: null,
  likes: null,
  comments: null,
  saves: null,
  shares: null,
  replies: null,
  reposts: null,
  profile_views: null,
  website_clicks: null,
}

function makeStats(overrides: Partial<IGPeriodStats> = {}): IGPeriodStats {
  return {
    reach: null,
    totals: nullTotals,
    follows: null,
    unfollows: null,
    followerDeltaSum: null,
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

describe('buildAudienceFromDemographics', () => {
  const demographics: IGDemographics = {
    age: { '25-34': 120, '18-24': 80 },
    gender: { F: 110, M: 85, U: 5 },
    city: {
      'Sofia, Sofia City Province': 50,
      'Plovdiv, Plovdiv Province': 30,
      'Varna, Varna Province': 20,
      'Burgas, Burgas Province': 10,
      'Ruse, Ruse Province': 5,
      'Vidin, Vidin Province': 1,
    },
    country: { BG: 180, DE: 20 },
  }

  it('keeps the separate age and gender maps and takes top-5 locations by value', () => {
    const audience = buildAudienceFromDemographics(demographics)
    expect(audience).not.toBeNull()
    expect(audience!.ages).toEqual({ '25-34': 120, '18-24': 80 })
    expect(audience!.genders).toEqual({ F: 110, M: 85, U: 5 })
    expect(audience!.top_cities).toHaveLength(5)
    expect(audience!.top_cities[0]).toEqual({ name: 'Sofia, Sofia City Province', value: 50 })
    expect(audience!.top_countries).toEqual([
      { name: 'BG', value: 180 },
      { name: 'DE', value: 20 },
    ])
  })

  it('passes null through (account under the demographics floor)', () => {
    expect(buildAudienceFromDemographics(null)).toBeNull()
  })
})

describe('deriveCumulativeFollowerSeries', () => {
  it('anchors the last day at the current total and walks back through the deltas', () => {
    const series = deriveCumulativeFollowerSeries(
      [
        { date: '2026-08-15', delta: 0 },
        { date: '2026-08-16', delta: 5 },
        { date: '2026-08-17', delta: 0 },
      ],
      829
    )
    // End of the 16th includes its +5; the 15th sits before it.
    expect(series).toEqual([
      { date: '2026-08-15', followers: 824 },
      { date: '2026-08-16', followers: 829 },
      { date: '2026-08-17', followers: 829 },
    ])
  })

  it('sorts unordered deltas before deriving', () => {
    const series = deriveCumulativeFollowerSeries(
      [
        { date: '2026-08-17', delta: 2 },
        { date: '2026-08-16', delta: 3 },
      ],
      100
    )
    expect(series).toEqual([
      { date: '2026-08-16', followers: 98 },
      { date: '2026-08-17', followers: 100 },
    ])
  })

  it('returns an empty curve for an empty delta series', () => {
    expect(deriveCumulativeFollowerSeries([], 500)).toEqual([])
  })
})

describe('buildDailyInsights', () => {
  it('merges reach and follower points by date, sorted ascending', () => {
    const rows = buildDailyInsights(
      [
        { date: '2026-08-16', reach: 20 },
        { date: '2026-08-15', reach: 10 },
      ],
      [{ date: '2026-08-16', followers: 829 }]
    )
    expect(rows).toEqual([
      { date: '2026-08-15', reach: 10 },
      { date: '2026-08-16', reach: 20, follower_count: 829 },
    ])
  })

  it('keeps a follower-only day (reach silent-empty is absence, not zero)', () => {
    const rows = buildDailyInsights([], [{ date: '2026-08-15', followers: 800 }])
    expect(rows).toEqual([{ date: '2026-08-15', follower_count: 800 }])
    expect(rows[0]!.reach).toBeUndefined()
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
  const emptyAgg = computeIGPostAggregates([], 1)

  it('uses the follow_type split when the API provided it', () => {
    const summary = buildIGSummary(
      makeStats({ follows: 10, unfollows: 3 }),
      makeStats(),
      emptyAgg,
      0
    )
    expect(summary.new_followers).toBe(10)
    expect(summary.unfollowers).toBe(3)
    expect(summary.net_follower_change).toBe(7)
  })

  it('falls back to the delta-series sum when the split is gated', () => {
    const summary = buildIGSummary(makeStats({ followerDeltaSum: 12 }), makeStats(), emptyAgg, 0)
    expect(summary.new_followers).toBe(12)
    expect(summary.net_follower_change).toBe(12)
  })

  it('computes deltas against the previous period and reports absent baselines as null', () => {
    const summary = buildIGSummary(
      makeStats({ reach: 150, totals: { ...nullTotals, website_clicks: 20 } }),
      makeStats({ reach: 100, totals: { ...nullTotals, website_clicks: 40 } }),
      emptyAgg,
      3
    )
    expect(summary.reach_delta_pct).toBe(50)
    expect(summary.website_clicks_delta_pct).toBe(-50)
    // No baseline for the other deltas
    expect(summary.views_delta_pct).toBeNull()
    expect(summary.posts_published).toBe(3)
  })

  it('collapses nulls to 0 only at this display edge', () => {
    const summary = buildIGSummary(makeStats(), makeStats(), emptyAgg, 0)
    expect(summary.total_reach).toBe(0)
    expect(summary.total_impressions).toBe(0)
    expect(summary.total_accounts_engaged).toBe(0)
  })
})

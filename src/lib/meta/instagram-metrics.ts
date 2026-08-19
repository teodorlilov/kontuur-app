import 'server-only'

import type { IGPost, InstagramMetrics } from '@/types/api'
import { MS_PER_DAY } from '@/utils/constants'
import {
  fetchAccountFields,
  fetchDailyReachSeries,
  fetchDayTotals,
  fetchDemographics,
  fetchFollowerDeltaSeries,
  fetchFollowsBreakdown,
  fetchManyMediaInsights,
  fetchMediaSince,
  type IGMediaInsights,
} from './insights'
import type { IGMediaItem } from './schemas'
import {
  type IGPeriodStats,
  buildAudienceFromDemographics,
  buildDailyInsights,
  buildIGSummary,
  computeIGMediaTypeBreakdown,
  computeIGPostAggregates,
  deriveCumulativeFollowerSeries,
} from './aggregate-metrics'

/**
 * The live report path, rebuilt on the probe-verified fetch layer. The old
 * implementation swallowed every failure into empty arrays and zeros — the
 * mechanism behind months of all-zero reports; here a GraphApiError propagates
 * to the route boundary, and only a genuine silent-empty becomes an absence.
 */

interface UnixRange {
  sinceTs: number
  untilTs: number
}

function toUnixRange(since: string, until: string): UnixRange {
  const sinceTs = Math.floor(new Date(since).getTime() / 1000)
  // End-of-day so the `until` date itself is included, capped at now — the
  // probe only ever verified windows ending at the present.
  const endOfUntil = Math.floor((new Date(until).getTime() + MS_PER_DAY) / 1000)
  return { sinceTs, untilTs: Math.min(endOfUntil, Math.floor(Date.now() / 1000)) }
}

interface PeriodFetch {
  stats: IGPeriodStats
  reachSeries: Array<{ date: string; reach: number }>
  deltaSeries: Array<{ date: string; delta: number }>
}

/** One period's account-level numbers — four independent calls in parallel. */
async function fetchPeriodStats(
  accountId: string,
  accessToken: string,
  range: UnixRange
): Promise<PeriodFetch> {
  const [reachSeries, deltaSeries, totals, followsSplit] = await Promise.all([
    fetchDailyReachSeries(accountId, accessToken, range.sinceTs, range.untilTs),
    fetchFollowerDeltaSeries(accountId, accessToken, range.sinceTs, range.untilTs),
    fetchDayTotals(accountId, accessToken, range.sinceTs, range.untilTs),
    fetchFollowsBreakdown(accountId, accessToken, range.sinceTs, range.untilTs),
  ])
  return {
    reachSeries,
    deltaSeries,
    stats: {
      // An empty series is the API's silent-empty, not a zero-reach period.
      reach: reachSeries.length > 0 ? reachSeries.reduce((sum, day) => sum + day.reach, 0) : null,
      totals,
      follows: followsSplit.follows,
      unfollows: followsSplit.unfollows,
      followerDeltaSum:
        deltaSeries.length > 0 ? deltaSeries.reduce((sum, day) => sum + day.delta, 0) : null,
    },
  }
}

function toIGPost(item: IGMediaItem, insights: IGMediaInsights): IGPost {
  return {
    id: item.id,
    caption: item.caption ?? null,
    timestamp: item.timestamp ?? '',
    media_type: item.media_type ?? 'UNKNOWN',
    like_count: item.like_count ?? 0,
    comments_count: item.comments_count ?? 0,
    saved: insights.saved ?? undefined,
    reach: insights.reach ?? undefined,
    impressions: insights.views ?? undefined,
    shares: insights.shares ?? undefined,
    total_interactions: insights.total_interactions ?? undefined,
    permalink: item.permalink,
    // thumbnail_url is video-only on /media; the image itself fills in elsewhere.
    thumbnail_url: item.thumbnail_url ?? item.media_url ?? null,
  }
}

/** Per-post lifetime insights for a media batch, at the fetch layer's bounded concurrency. */
async function fetchPostsWithInsights(
  media: IGMediaItem[],
  accessToken: string
): Promise<IGPost[]> {
  const insights = await fetchManyMediaInsights(
    media.map((item) => item.id),
    accessToken
  )
  return media.map((item, index) => toIGPost(item, insights[index]!))
}

/** Media posted inside the range — fetchMediaSince already cut the older side. */
function mediaUpTo(media: IGMediaItem[], untilTs: number): IGMediaItem[] {
  return media.filter(
    (item) => !item.timestamp || new Date(item.timestamp).getTime() <= untilTs * 1000
  )
}

/** Fetches all Instagram metrics for a client account and date range. */
export async function fetchInstagramMetrics(
  accountId: string,
  accessToken: string,
  since: string,
  until: string
): Promise<InstagramMetrics> {
  const range = toUnixRange(since, until)
  const prevRange: UnixRange = {
    sinceTs: range.sinceTs - (range.untilTs - range.sinceTs),
    untilTs: range.sinceTs,
  }

  const [account, current, previous, demographics, media] = await Promise.all([
    fetchAccountFields(accountId, accessToken),
    fetchPeriodStats(accountId, accessToken, range),
    fetchPeriodStats(accountId, accessToken, prevRange),
    fetchDemographics(accountId, accessToken, 'follower_demographics'),
    fetchMediaSince(accountId, accessToken, since),
  ])

  // Every post in range gets insights — the old limit=50 single page truncated
  // busier accounts; pagination bounds this at maxPages, not one response.
  const posts = await fetchPostsWithInsights(mediaUpTo(media, range.untilTs), accessToken)

  const followers = account.followers_count || 1
  const postAgg = computeIGPostAggregates(posts, followers)
  const followerSeries = deriveCumulativeFollowerSeries(
    current.deltaSeries,
    account.followers_count
  )

  return {
    platform: 'instagram',
    account: {
      followers_count: account.followers_count,
      follows_count: account.follows_count,
      media_count: account.media_count,
    },
    summary: buildIGSummary(current.stats, previous.stats, postAgg, posts.length),
    daily_insights: buildDailyInsights(current.reachSeries, followerSeries),
    posts,
    audience: buildAudienceFromDemographics(demographics),
    media_type_breakdown: computeIGMediaTypeBreakdown(posts, followers),
  }
}

// Insights cap for the research performance source — it ranks a recent pool
// before picking the top performers, so it never needs every post in range.
const PERFORMANCE_INSIGHTS_CAP = 30

/** Engagement key: platform insights first, public counts as fallback for media types without insights. */
function engagementOf(post: IGPost): number {
  if (post.total_interactions && post.total_interactions > 0) return post.total_interactions
  return post.like_count + post.comments_count + (post.saved ?? 0)
}

/**
 * Fetches the client's top recent IG posts by engagement — lean subset of
 * fetchInstagramMetrics (media + per-post insights only; no account, daily,
 * audience, or prev-period calls). The signature is pinned: the research
 * performance source depends on it.
 */
export async function fetchTopPerformingPosts(
  accountId: string,
  accessToken: string,
  since: string,
  until: string,
  limit: number
): Promise<IGPost[]> {
  const range = toUnixRange(since, until)
  const media = mediaUpTo(await fetchMediaSince(accountId, accessToken, since), range.untilTs)
  if (media.length === 0) return []

  const posts = await fetchPostsWithInsights(media.slice(0, PERFORMANCE_INSIGHTS_CAP), accessToken)
  return posts.sort((a, b) => engagementOf(b) - engagementOf(a)).slice(0, limit)
}

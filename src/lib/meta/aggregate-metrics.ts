import type {
  AudienceDemographics,
  IGDailyInsight,
  IGPost,
  InstagramMetrics,
  MediaTypeBreakdownItem,
} from '@/types/api'
import type { IGDayTotals, IGDemographics } from './insights'

/**
 * Pure assembly for the Instagram report — everything here is deterministic
 * over values the fetch layer (insights.ts) already extracted. The old pivot
 * helpers died with the rewrite: the API serves range totals and two daily
 * series, not the per-day metric grid they pretended to reshape.
 */

/** What one period's account-level fetches boil down to; null means the API served nothing. */
export interface IGPeriodStats {
  /** Sum of the daily reach series, or null when the series was empty. */
  reach: number | null
  totals: IGDayTotals
  follows: number | null
  unfollows: number | null
  /** Sum of the daily new-follower deltas, or null when the series was empty. */
  followerDeltaSum: number | null
}

/** Computes a rounded percentage delta between two period totals, or null when there is no baseline. */
export function deltaPct(curr: number, prev: number): number | null {
  return prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null
}

/** Maps a demographics fetch onto the report's audience shape (top-5 cities/countries). */
export function buildAudienceFromDemographics(
  demographics: IGDemographics | null
): AudienceDemographics | null {
  if (!demographics) return null
  const topFive = (map: Record<string, number>) =>
    Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }))
  return {
    ages: demographics.age,
    genders: demographics.gender,
    top_cities: topFive(demographics.city),
    top_countries: topFive(demographics.country),
  }
}

/**
 * Derives the cumulative follower curve by walking BACK from today's total:
 * the API serves only the per-day new-follower delta and the current
 * followers_count, so each step back subtracts that day's delta. Approximate by
 * construction — changes after the last bucket and the unfollow side are
 * invisible to the delta series — but it is the only curve the API can honestly
 * support, and the trend shape is what the chart is for.
 */
export function deriveCumulativeFollowerSeries(
  deltas: Array<{ date: string; delta: number }>,
  currentFollowers: number
): Array<{ date: string; followers: number }> {
  const sorted = [...deltas].sort((a, b) => a.date.localeCompare(b.date))
  const series: Array<{ date: string; followers: number }> = new Array(sorted.length)
  let running = currentFollowers
  for (let i = sorted.length - 1; i >= 0; i--) {
    series[i] = { date: sorted[i]!.date, followers: running }
    running -= sorted[i]!.delta
  }
  return series
}

/** Merges the reach series and the cumulative follower series into per-day insight rows. */
export function buildDailyInsights(
  reachSeries: Array<{ date: string; reach: number }>,
  followerSeries: Array<{ date: string; followers: number }>
): IGDailyInsight[] {
  const byDate = new Map<string, IGDailyInsight>()
  const rowFor = (date: string): IGDailyInsight => {
    let row = byDate.get(date)
    if (!row) {
      row = { date }
      byDate.set(date, row)
    }
    return row
  }
  for (const point of reachSeries) rowFor(point.date).reach = point.reach
  for (const point of followerSeries) rowFor(point.date).follower_count = point.followers
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Computes post-level aggregate metrics. */
export function computeIGPostAggregates(posts: IGPost[], followers: number) {
  const totalEngagements = posts.reduce((s, p) => s + p.like_count + p.comments_count, 0)
  const avgEngagementRate =
    posts.length > 0 ? Math.round((totalEngagements / posts.length / followers) * 1000) / 10 : 0
  const totalSaved = posts.reduce((s, p) => s + (p.saved ?? 0), 0)
  const totalPostReach = posts.reduce((s, p) => s + (p.reach ?? 0), 0)
  const avgSaveRate = totalPostReach > 0 ? Math.round((totalSaved / totalPostReach) * 1000) / 10 : 0
  const totalShares = posts.reduce((s, p) => s + (p.shares ?? 0), 0)
  return { avgEngagementRate, totalSaved, avgSaveRate, totalShares }
}

/** Computes media type breakdown by engagement rate. */
export function computeIGMediaTypeBreakdown(
  posts: IGPost[],
  followers: number
): MediaTypeBreakdownItem[] {
  const map: Record<string, { totalER: number; count: number }> = {}
  for (const post of posts) {
    const denominator = post.reach && post.reach > 0 ? post.reach : followers
    const er = ((post.like_count + post.comments_count) / denominator) * 100
    if (!map[post.media_type]) map[post.media_type] = { totalER: 0, count: 0 }
    map[post.media_type]!.totalER += er
    map[post.media_type]!.count++
  }
  return Object.entries(map)
    .map(([type, d]) => ({
      type,
      avg_engagement_rate: Math.round((d.totalER / d.count) * 10) / 10,
      count: d.count,
    }))
    .sort((a, b) => b.avg_engagement_rate - a.avg_engagement_rate)
}

/**
 * Assembles the report summary from this period's stats, the previous period's
 * (for deltas), and the post aggregates. Nulls collapse to 0 HERE, at the edge
 * of a summary the UI renders as plain numbers — the persistence layer keeps
 * the null-vs-0 distinction instead.
 */
export function buildIGSummary(
  current: IGPeriodStats,
  previous: IGPeriodStats,
  postAgg: ReturnType<typeof computeIGPostAggregates>,
  postsCount: number
): InstagramMetrics['summary'] {
  // The follows_and_unfollows split and the delta series are both ≥100-follower
  // gated; when the split is absent the delta sum is the same "new followers"
  // fact from the other endpoint (probe: FOLLOWER 5 vs delta sum 5).
  const newFollowers = current.follows ?? current.followerDeltaSum ?? 0
  const unfollowers = current.unfollows ?? 0
  const prevNewFollowers = previous.follows ?? previous.followerDeltaSum ?? 0
  const prevNet = prevNewFollowers - (previous.unfollows ?? 0)
  return {
    total_reach: current.reach ?? 0,
    total_impressions: current.totals.views ?? 0,
    total_profile_views: current.totals.profile_views ?? 0,
    avg_engagement_rate: postAgg.avgEngagementRate,
    posts_published: postsCount,
    new_followers: newFollowers,
    unfollowers,
    net_follower_change: newFollowers - unfollowers,
    organic_reach_pct: null,
    paid_reach_pct: null,
    reach_delta_pct: deltaPct(current.reach ?? 0, previous.reach ?? 0),
    views_delta_pct: deltaPct(current.totals.views ?? 0, previous.totals.views ?? 0),
    profile_views_delta_pct: deltaPct(
      current.totals.profile_views ?? 0,
      previous.totals.profile_views ?? 0
    ),
    net_followers_delta_pct: deltaPct(newFollowers - unfollowers, prevNet),
    avg_save_rate: postAgg.avgSaveRate,
    total_saved: postAgg.totalSaved,
    total_shares: postAgg.totalShares,
    total_accounts_engaged: current.totals.accounts_engaged ?? 0,
    total_website_clicks: current.totals.website_clicks ?? 0,
    accounts_engaged_delta_pct: deltaPct(
      current.totals.accounts_engaged ?? 0,
      previous.totals.accounts_engaged ?? 0
    ),
    website_clicks_delta_pct: deltaPct(
      current.totals.website_clicks ?? 0,
      previous.totals.website_clicks ?? 0
    ),
  }
}

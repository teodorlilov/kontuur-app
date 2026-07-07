import type {
  AudienceDemographics,
  FBDailyInsight,
  IGDailyInsight,
  IGPost,
  InstagramMetrics,
  MediaTypeBreakdownItem,
} from '@/types/api'

export type AudienceApiData = Array<{
  name: string
  values: Array<{ value: Record<string, number> }>
}>

type IGInsightValue = number | { follow?: number; unfollow?: number }

export type IGInsightData = Array<{
  name: string
  values: Array<{ value: IGInsightValue; end_time: string }>
}>

export interface IGPrevPeriodDeltas {
  reach: number
  impressions: number
  profileViews: number
  newFollowers: number
  unfollowers: number
  accountsEngaged: number
  websiteClicks: number
}

// IG Business Login API uses 'views' where we store 'impressions'
const IG_METRIC_KEY_MAP: Record<string, string> = { views: 'impressions' }

/** Computes a rounded percentage delta between two period totals, or null when there is no baseline. */
export function deltaPct(curr: number, prev: number): number | null {
  return prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null
}

/** Builds gender/age + top-city/country demographics from raw insight API data. */
export function buildAudienceDemographics(
  data: AudienceApiData,
  genderAgeMetric: string,
  cityMetric: string,
  countryMetric: string
): AudienceDemographics | null {
  const genderAge = data.find((d) => d.name === genderAgeMetric)?.values[0]?.value ?? {}
  const cityRaw = data.find((d) => d.name === cityMetric)?.values[0]?.value ?? {}
  const countryRaw = data.find((d) => d.name === countryMetric)?.values[0]?.value ?? {}
  if (Object.keys(genderAge).length === 0) return null
  return {
    gender_age: genderAge,
    top_cities: Object.entries(cityRaw)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value })),
    top_countries: Object.entries(countryRaw)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value })),
  }
}

/** Pivots raw IG insight API data into daily insight records. */
export function pivotIGInsights(data: IGInsightData): IGDailyInsight[] {
  const dailyMap: Record<string, Record<string, unknown>> = {}
  for (const metric of data) {
    for (const entry of metric.values) {
      const date = entry.end_time.split('T')[0]!
      if (!dailyMap[date]) dailyMap[date] = { date }
      // follows_and_unfollows returns {follow, unfollow} — split into separate fields
      if (metric.name === 'follows_and_unfollows') {
        if (entry.value != null && typeof entry.value === 'object') {
          const obj = entry.value as Record<string, number>
          dailyMap[date]!.follows = obj.follow ?? obj.follows ?? 0
          dailyMap[date]!.unfollows = obj.unfollow ?? obj.unfollows ?? 0
        }
      } else {
        const key = IG_METRIC_KEY_MAP[metric.name] ?? metric.name
        dailyMap[date]![key] = entry.value
      }
    }
  }
  // Dynamic keys from API — assert to our typed interface
  return Object.values(dailyMap)
    .map((d) => d as unknown as IGDailyInsight)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export type FBInsightData = Array<{
  name: string
  values: Array<{ value: number; end_time: string }>
}>

const FB_INSIGHT_KEY_MAP: Record<string, string> = {
  page_impressions: 'impressions',
  page_reach: 'reach',
  page_engaged_users: 'engaged_users',
  page_views_total: 'page_views',
  page_fan_adds: 'fan_adds',
  page_fan_removes: 'fan_removes',
  page_organic_reach: 'organic_reach',
  page_paid_reach: 'paid_reach',
}

/** Pivots raw FB page insight API data into daily insight records. */
export function pivotFBInsights(data: FBInsightData): FBDailyInsight[] {
  const dailyMap: Record<string, Record<string, unknown>> = {}
  for (const metric of data) {
    const key = FB_INSIGHT_KEY_MAP[metric.name]
    if (!key) continue
    for (const entry of metric.values) {
      const date = entry.end_time.split('T')[0]!
      if (!dailyMap[date]) dailyMap[date] = { date }
      dailyMap[date]![key] = entry.value
    }
  }
  // Dynamic keys from API — assert to our typed interface
  return Object.values(dailyMap)
    .map((d) => d as unknown as FBDailyInsight)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Sums daily IG insight values into period totals. */
export function sumIGDailyInsights(dailyInsights: IGDailyInsight[]) {
  return {
    totalReach: dailyInsights.reduce((s, d) => s + (d.reach ?? 0), 0),
    totalImpressions: dailyInsights.reduce((s, d) => s + (d.impressions ?? 0), 0),
    totalProfileViews: dailyInsights.reduce((s, d) => s + (d.profile_views ?? 0), 0),
    totalAccountsEngaged: dailyInsights.reduce((s, d) => s + (d.accounts_engaged ?? 0), 0),
    totalWebsiteClicks: dailyInsights.reduce((s, d) => s + (d.website_clicks ?? 0), 0),
    totalFollows: dailyInsights.reduce((s, d) => s + (d.follows ?? 0), 0),
    totalUnfollows: dailyInsights.reduce((s, d) => s + (d.unfollows ?? 0), 0),
  }
}

/** Fallback: derives net follower change from first/last follower_count daily snapshots. */
export function computeNetChangeFromSnapshots(dailyInsights: IGDailyInsight[]): number {
  const withCount = dailyInsights.filter((d) => d.follower_count != null && d.follower_count > 0)
  if (withCount.length < 2) return 0
  return withCount[withCount.length - 1]!.follower_count! - withCount[0]!.follower_count!
}

/** Computes post-level aggregate metrics. */
export function computeIGPostAggregates(posts: IGPost[], followers: number) {
  const totalEngagements = posts.reduce((s, p) => s + p.like_count + p.comments_count, 0)
  const avgEngagementRate =
    posts.length > 0 ? Math.round((totalEngagements / posts.length / followers) * 1000) / 10 : 0
  const totalSaved = posts.reduce((s, p) => s + (p.saved ?? 0), 0)
  const totalPostReach = posts.reduce((s, p) => s + (p.reach ?? 0), 0)
  const avgSaveRate =
    totalPostReach > 0 ? Math.round((totalSaved / totalPostReach) * 1000) / 10 : 0
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

/** Assembles the IG summary from computed values and previous-period deltas. */
export function buildIGSummary(
  sums: ReturnType<typeof sumIGDailyInsights>,
  postAgg: ReturnType<typeof computeIGPostAggregates>,
  postsCount: number,
  deltas: IGPrevPeriodDeltas,
  dailyInsights: IGDailyInsight[]
): InstagramMetrics['summary'] {
  const followsAvailable = sums.totalFollows > 0 || sums.totalUnfollows > 0
  const netFollowerChange = followsAvailable
    ? sums.totalFollows - sums.totalUnfollows
    : computeNetChangeFromSnapshots(dailyInsights)
  return {
    total_reach: sums.totalReach,
    total_impressions: sums.totalImpressions,
    total_profile_views: sums.totalProfileViews,
    avg_engagement_rate: postAgg.avgEngagementRate,
    posts_published: postsCount,
    new_followers: sums.totalFollows,
    unfollowers: sums.totalUnfollows,
    net_follower_change: netFollowerChange,
    organic_reach_pct: null,
    paid_reach_pct: null,
    reach_delta_pct: deltaPct(sums.totalReach, deltas.reach),
    views_delta_pct: deltaPct(sums.totalImpressions, deltas.impressions),
    profile_views_delta_pct: deltaPct(sums.totalProfileViews, deltas.profileViews),
    net_followers_delta_pct: deltaPct(netFollowerChange, deltas.newFollowers - deltas.unfollowers),
    avg_save_rate: postAgg.avgSaveRate,
    total_saved: postAgg.totalSaved,
    total_shares: postAgg.totalShares,
    total_accounts_engaged: sums.totalAccountsEngaged,
    total_website_clicks: sums.totalWebsiteClicks,
    accounts_engaged_delta_pct: deltaPct(sums.totalAccountsEngaged, deltas.accountsEngaged),
    website_clicks_delta_pct: deltaPct(sums.totalWebsiteClicks, deltas.websiteClicks),
  }
}

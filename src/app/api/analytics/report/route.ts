import { NextRequest, NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership, fetchClientWithOwnership } from '@/lib/auth/helpers'
import { generateAnalyticsSummary } from '@/ai/analytics/generate-summary'
import type {
  AnalyticsReportRequest,
  InstagramMetrics,
  FacebookMetrics,
  IGDailyInsight,
  IGPost,
  FBDailyInsight,
  FBPost,
  AudienceDemographics,
  MediaTypeBreakdownItem,
} from '@/types/api'

const GRAPH_BASE = 'https://graph.facebook.com/v21.0'
const IG_GRAPH_BASE = 'https://graph.instagram.com/v21.0'

// ---- Shared helpers ----

function deltaPct(curr: number, prev: number): number | null {
  return prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null
}

type AudienceApiData = Array<{ name: string; values: Array<{ value: Record<string, number> }> }>

function buildAudienceDemographics(
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

// ---- Instagram helpers ----

const IG_INSIGHT_METRICS =
  'reach,views,profile_views,follower_count,accounts_engaged,website_clicks,follows_and_unfollows'

// IG Business Login API uses 'views' where we store 'impressions'
const IG_METRIC_KEY_MAP: Record<string, string> = { views: 'impressions' }

interface IGRawMedia {
  id: string
  caption?: string
  timestamp: string
  media_type: string
  like_count: number
  comments_count: number
  permalink?: string
  thumbnail_url?: string
  media_url?: string
}

type IGInsightValue = number | { follow?: number; unfollow?: number }
type IGInsightData = Array<{ name: string; values: Array<{ value: IGInsightValue; end_time: string }> }>

interface IGPrevPeriodDeltas {
  reach: number
  impressions: number
  profileViews: number
  newFollowers: number
  unfollowers: number
  accountsEngaged: number
  websiteClicks: number
}

/** Pivots raw IG insight API data into daily insight records. */
function pivotIGInsights(data: IGInsightData): IGDailyInsight[] {
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

/** Fetches basic IG account info. */
async function fetchIGAccount(
  accountId: string,
  token: string
): Promise<{ followers_count: number; follows_count: number; media_count: number }> {
  const res = await fetch(
    `${IG_GRAPH_BASE}/${accountId}?fields=followers_count,follows_count,media_count&${token}`
  )
  if (!res.ok) throw new Error('Failed to fetch Instagram account data')
  return res.json() as Promise<{ followers_count: number; follows_count: number; media_count: number }>
}

/** Fetches daily IG insights for a date range (unix timestamps). */
async function fetchIGDailyInsights(
  accountId: string,
  token: string,
  sinceTs: number,
  untilTs: number
): Promise<IGDailyInsight[]> {
  const res = await fetch(
    `${IG_GRAPH_BASE}/${accountId}/insights?metric=${IG_INSIGHT_METRICS}&period=day&since=${sinceTs}&until=${untilTs}&${token}`
  )
  if (!res.ok) return []
  const body = (await res.json()) as { data: IGInsightData }
  // Debug: log which metrics the API actually returned
  const metricNames = body.data.map((m) => m.name)
  console.log('[IG Insights] Metrics returned:', metricNames)
  if (!metricNames.includes('follows_and_unfollows')) {
    console.log('[IG Insights] follows_and_unfollows NOT in response — will use follower_count snapshots')
  }
  return pivotIGInsights(body.data)
}

/** Fetches recent media and filters to the given date range. */
async function fetchIGMediaInRange(
  accountId: string,
  token: string,
  since: string,
  until: string
): Promise<IGRawMedia[]> {
  const res = await fetch(
    `${IG_GRAPH_BASE}/${accountId}/media?fields=id,caption,timestamp,media_type,like_count,comments_count,permalink,thumbnail_url,media_url&limit=50&${token}`
  )
  if (!res.ok) return []
  const body = (await res.json()) as { data: IGRawMedia[] }
  const sinceDate = new Date(since)
  const untilDate = new Date(until)
  untilDate.setHours(23, 59, 59, 999)
  return body.data.filter((m) => {
    const t = new Date(m.timestamp)
    return t >= sinceDate && t <= untilDate
  })
}

/** Fetches insight metrics for a single IG post. */
async function fetchSingleIGPostInsights(
  mediaId: string,
  token: string
): Promise<{ saved: number; reach: number; impressions: number; shares: number; totalInteractions: number }> {
  const zero = { saved: 0, reach: 0, impressions: 0, shares: 0, totalInteractions: 0 }
  try {
    const res = await fetch(
      `${IG_GRAPH_BASE}/${mediaId}/insights?metric=saved,reach,views,shares,total_interactions&${token}`
    )
    if (!res.ok) return zero
    const body = (await res.json()) as {
      data: Array<{ name: string; values: Array<{ value: number }> }>
    }
    const result = { ...zero }
    for (const m of body.data) {
      const val = m.values[0]?.value ?? 0
      if (m.name === 'saved') result.saved = val
      if (m.name === 'reach') result.reach = val
      if (m.name === 'views') result.impressions = val
      if (m.name === 'shares') result.shares = val
      if (m.name === 'total_interactions') result.totalInteractions = val
    }
    return result
  } catch {
    return zero
  }
}

/** Fetches per-post insights for up to 20 media items in parallel. */
async function fetchIGPostInsights(mediaList: IGRawMedia[], token: string): Promise<IGPost[]> {
  return Promise.all(
    mediaList.slice(0, 20).map(async (media) => {
      const ins = await fetchSingleIGPostInsights(media.id, token)
      return {
        id: media.id,
        caption: media.caption ?? null,
        timestamp: media.timestamp,
        media_type: media.media_type,
        like_count: media.like_count,
        comments_count: media.comments_count,
        saved: ins.saved,
        reach: ins.reach,
        impressions: ins.impressions,
        shares: ins.shares,
        total_interactions: ins.totalInteractions,
        permalink: media.permalink,
        thumbnail_url: media.thumbnail_url ?? media.media_url ?? null,
      }
    })
  )
}

/** Sums daily IG insight values into period totals. */
function sumIGDailyInsights(dailyInsights: IGDailyInsight[]) {
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
function computeNetChangeFromSnapshots(dailyInsights: IGDailyInsight[]): number {
  const withCount = dailyInsights.filter((d) => d.follower_count != null && d.follower_count > 0)
  if (withCount.length < 2) return 0
  return withCount[withCount.length - 1]!.follower_count! - withCount[0]!.follower_count!
}

/** Computes post-level aggregate metrics. */
function computeIGPostAggregates(posts: IGPost[], followers: number) {
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
function computeIGMediaTypeBreakdown(posts: IGPost[], followers: number): MediaTypeBreakdownItem[] {
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

/** Fetches IG audience demographics (optional — may fail for small accounts). */
async function fetchIGAudienceDemographics(
  accountId: string,
  token: string
): Promise<AudienceDemographics | null> {
  try {
    const res = await fetch(
      `${IG_GRAPH_BASE}/${accountId}/insights?metric=audience_gender_age,audience_city,audience_country&period=lifetime&${token}`
    )
    if (!res.ok) return null
    const { data } = (await res.json()) as { data: AudienceApiData }
    return buildAudienceDemographics(data, 'audience_gender_age', 'audience_city', 'audience_country')
  } catch {
    return null
  }
}

/** Fetches equivalent previous period and returns sums for delta computation. */
async function fetchIGPrevPeriodDeltas(
  accountId: string,
  token: string,
  sinceTs: number,
  untilTs: number
): Promise<IGPrevPeriodDeltas> {
  const zero: IGPrevPeriodDeltas = {
    reach: 0, impressions: 0, profileViews: 0,
    newFollowers: 0, unfollowers: 0, accountsEngaged: 0, websiteClicks: 0,
  }
  try {
    const periodS = untilTs - sinceTs
    const prevInsights = await fetchIGDailyInsights(accountId, token, sinceTs - periodS, sinceTs)
    const sums = sumIGDailyInsights(prevInsights)
    return {
      reach: sums.totalReach,
      impressions: sums.totalImpressions,
      profileViews: sums.totalProfileViews,
      newFollowers: sums.totalFollows,
      unfollowers: sums.totalUnfollows,
      accountsEngaged: sums.totalAccountsEngaged,
      websiteClicks: sums.totalWebsiteClicks,
    }
  } catch {
    return zero
  }
}

/** Assembles the IG summary from computed values and previous-period deltas. */
function buildIGSummary(
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

// ---- Instagram fetching ----

/** Fetches all Instagram metrics for a client account and date range. */
async function fetchInstagramMetrics(
  accountId: string,
  accessToken: string,
  since: string,
  until: string
): Promise<InstagramMetrics> {
  const token = `access_token=${accessToken}`
  const sinceTs = Math.floor(new Date(since).getTime() / 1000)
  const untilTs = Math.floor(new Date(until).getTime() / 1000)

  const account = await fetchIGAccount(accountId, token)
  const dailyInsights = await fetchIGDailyInsights(accountId, token, sinceTs, untilTs)
  const media = await fetchIGMediaInRange(accountId, token, since, until)
  const posts = await fetchIGPostInsights(media, token)
  const audience = await fetchIGAudienceDemographics(accountId, token)

  const followers = account.followers_count || 1
  const sums = sumIGDailyInsights(dailyInsights)
  const postAgg = computeIGPostAggregates(posts, followers)
  const deltas = await fetchIGPrevPeriodDeltas(accountId, token, sinceTs, untilTs)

  return {
    platform: 'instagram',
    account,
    summary: buildIGSummary(sums, postAgg, posts.length, deltas, dailyInsights),
    daily_insights: dailyInsights,
    posts,
    audience,
    media_type_breakdown: computeIGMediaTypeBreakdown(posts, followers),
  }
}

// ---- Facebook fetching ----

async function fetchFacebookMetrics(
  pageId: string,
  accessToken: string,
  since: string,
  until: string
): Promise<FacebookMetrics> {
  const token = `access_token=${accessToken}`

  // Convert ISO dates to Unix timestamps (required by Insights API)
  const sinceTs = Math.floor(new Date(since).getTime() / 1000)
  const untilTs = Math.floor(new Date(until).getTime() / 1000)

  // Page summary
  const pageRes = await fetch(`${GRAPH_BASE}/${pageId}?fields=fan_count,followers_count&${token}`)
  if (!pageRes.ok) throw new Error('Failed to fetch Facebook page data')
  const page = (await pageRes.json()) as { fan_count: number; followers_count: number }

  // Page insights (uses Unix timestamps)
  const insightMetrics =
    'page_impressions,page_reach,page_engaged_users,page_views_total,page_fan_adds,page_fan_removes,page_organic_reach,page_paid_reach'
  const insightRes = await fetch(
    `${GRAPH_BASE}/${pageId}/insights?metric=${insightMetrics}&period=day&since=${sinceTs}&until=${untilTs}&${token}`
  )
  const insightData = insightRes.ok
    ? ((await insightRes.json()) as {
        data: Array<{ name: string; values: Array<{ value: number; end_time: string }> }>
      })
    : { data: [] }

  const dailyMap: Record<string, Record<string, unknown>> = {}
  const insightKeyMap: Record<string, string> = {
    page_impressions: 'impressions',
    page_reach: 'reach',
    page_engaged_users: 'engaged_users',
    page_views_total: 'page_views',
    page_fan_adds: 'fan_adds',
    page_fan_removes: 'fan_removes',
    page_organic_reach: 'organic_reach',
    page_paid_reach: 'paid_reach',
  }
  for (const metric of insightData.data) {
    const key = insightKeyMap[metric.name]
    if (!key) continue
    for (const entry of metric.values) {
      const date = entry.end_time.split('T')[0]!
      if (!dailyMap[date]) dailyMap[date] = { date }
      dailyMap[date]![key] = entry.value
    }
  }
  const dailyInsights = Object.values(dailyMap)
    .map((d) => d as unknown as FBDailyInsight)
    .sort((a, b) => a.date.localeCompare(b.date))

  // Posts in range
  const postsRes = await fetch(
    `${GRAPH_BASE}/${pageId}/posts?fields=id,message,created_time&since=${since}&until=${until}&limit=25&${token}`
  )
  const postsData = postsRes.ok
    ? ((await postsRes.json()) as {
        data: Array<{ id: string; message?: string; created_time: string }>
      })
    : { data: [] }

  // Per-post insights (max 10) — all fetches run in parallel
  const posts: FBPost[] = await Promise.all(
    postsData.data.slice(0, 10).map(async (post) => {
      let reactions = 0
      let comments = 0
      let shares = 0
      let reach = 0
      let impressions = 0
      try {
        const postInsightRes = await fetch(
          `${GRAPH_BASE}/${post.id}/insights?metric=post_reactions_by_type_total,post_comments,post_shares,post_reach,post_impressions&${token}`
        )
        if (postInsightRes.ok) {
          const postInsight = (await postInsightRes.json()) as {
            data: Array<{ name: string; values: Array<{ value: number | Record<string, number> }> }>
          }
          for (const m of postInsight.data) {
            const rawVal = m.values[0]?.value ?? 0
            if (m.name === 'post_reactions_by_type_total') {
              reactions =
                typeof rawVal === 'object'
                  ? Object.values(rawVal).reduce((s, v) => s + (v as number), 0)
                  : (rawVal as number)
            }
            if (m.name === 'post_comments') comments = rawVal as number
            if (m.name === 'post_shares') shares = rawVal as number
            if (m.name === 'post_reach') reach = rawVal as number
            if (m.name === 'post_impressions') impressions = rawVal as number
          }
        }
      } catch {
        /* ignore */
      }
      return {
        id: post.id,
        message: post.message ?? null,
        created_time: post.created_time,
        reactions,
        comments,
        shares,
        reach,
        impressions,
      }
    })
  )

  const totalReach = dailyInsights.reduce((sum, d) => sum + (d.reach ?? 0), 0)
  const totalImpressions = dailyInsights.reduce((sum, d) => sum + (d.impressions ?? 0), 0)
  const totalEngagedUsers = dailyInsights.reduce((sum, d) => sum + (d.engaged_users ?? 0), 0)

  const fans = page.fan_count || 1
  const totalEngagements = posts.reduce((sum, p) => sum + p.reactions + p.comments + p.shares, 0)
  const avgEngagementRate =
    posts.length > 0 ? Math.round((totalEngagements / posts.length / fans) * 1000) / 10 : 0

  const totalNewFollowers = dailyInsights.reduce((sum, d) => sum + (d.fan_adds ?? 0), 0)
  const totalUnfollowers = dailyInsights.reduce((sum, d) => sum + (d.fan_removes ?? 0), 0)
  const totalOrganicReach = dailyInsights.reduce((sum, d) => sum + (d.organic_reach ?? 0), 0)
  const totalPaidReach = dailyInsights.reduce((sum, d) => sum + (d.paid_reach ?? 0), 0)
  const organicReachPct = totalReach > 0 ? Math.round((totalOrganicReach / totalReach) * 100) : null
  const paidReachPct = totalReach > 0 ? Math.round((totalPaidReach / totalReach) * 100) : null

  // Fetch previous period for delta computation
  const periodMsFb = new Date(until).getTime() - new Date(since).getTime()
  const prevSinceTsFb = Math.floor((new Date(since).getTime() - periodMsFb) / 1000)
  const prevUntilTsFb = sinceTs
  let prevTotalReachFb = 0
  let prevTotalImpressionsFb = 0
  let prevNewFollowersFb = 0
  try {
    const prevInsightRes = await fetch(
      `${GRAPH_BASE}/${pageId}/insights?metric=${insightMetrics}&period=day&since=${prevSinceTsFb}&until=${prevUntilTsFb}&${token}`
    )
    if (prevInsightRes.ok) {
      const prevInsightData = (await prevInsightRes.json()) as {
        data: Array<{ name: string; values: Array<{ value: number; end_time: string }> }>
      }
      const prevDailyMap: Record<string, Record<string, unknown>> = {}
      for (const metric of prevInsightData.data) {
        const key = insightKeyMap[metric.name]
        if (!key) continue
        for (const entry of metric.values) {
          const date = entry.end_time.split('T')[0]!
          if (!prevDailyMap[date]) prevDailyMap[date] = { date }
          prevDailyMap[date]![key] = entry.value
        }
      }
      const prevInsights = Object.values(prevDailyMap).map((d) => d as unknown as FBDailyInsight)
      prevTotalReachFb = prevInsights.reduce((s, d) => s + (d.reach ?? 0), 0)
      prevTotalImpressionsFb = prevInsights.reduce((s, d) => s + (d.impressions ?? 0), 0)
      prevNewFollowersFb = prevInsights.reduce((s, d) => s + (d.fan_adds ?? 0), 0)
    }
  } catch {
    /* delta is optional */
  }

  // Media type breakdown (from posts, no extra API call)
  const fbMediaTypeMap: Record<string, { totalER: number; count: number }> = {}
  for (const post of posts) {
    // Facebook posts don't have media_type; group under a single bucket
    const type = 'Post'
    const er = ((post.reactions + post.comments + post.shares) / fans) * 100
    if (!fbMediaTypeMap[type]) fbMediaTypeMap[type] = { totalER: 0, count: 0 }
    fbMediaTypeMap[type]!.totalER += er
    fbMediaTypeMap[type]!.count++
  }
  const fb_media_type_breakdown: MediaTypeBreakdownItem[] = Object.entries(fbMediaTypeMap).map(
    ([type, d]) => ({
      type,
      avg_engagement_rate: Math.round((d.totalER / d.count) * 10) / 10,
      count: d.count,
    })
  )

  const fbTotalShares = posts.reduce((s, p) => s + p.shares, 0)

  // Audience demographics
  let audience: AudienceDemographics | null = null
  try {
    const audienceRes = await fetch(
      `${GRAPH_BASE}/${pageId}/insights?metric=page_fans_gender_age,page_fans_country,page_fans_city&period=lifetime&${token}`
    )
    if (audienceRes.ok) {
      const { data } = (await audienceRes.json()) as { data: AudienceApiData }
      audience = buildAudienceDemographics(
        data,
        'page_fans_gender_age',
        'page_fans_city',
        'page_fans_country'
      )
    }
  } catch {
    /* audience data is optional */
  }

  return {
    platform: 'facebook',
    account: {
      fan_count: page.fan_count,
      followers_count: page.followers_count,
    },
    summary: {
      total_reach: totalReach,
      total_impressions: totalImpressions,
      total_engaged_users: totalEngagedUsers,
      avg_engagement_rate: avgEngagementRate,
      posts_published: posts.length,
      new_followers: totalNewFollowers,
      unfollowers: totalUnfollowers,
      organic_reach_pct: organicReachPct,
      paid_reach_pct: paidReachPct,
      reach_delta_pct: deltaPct(totalReach, prevTotalReachFb),
      views_delta_pct: deltaPct(totalImpressions, prevTotalImpressionsFb),
      profile_views_delta_pct: null,
      followers_delta_pct: deltaPct(totalNewFollowers, prevNewFollowersFb),
      avg_save_rate: 0,
      total_saved: 0,
      total_shares: fbTotalShares,
    },
    daily_insights: dailyInsights,
    posts,
    audience,
    media_type_breakdown: fb_media_type_breakdown,
  }
}

// ---- Route handlers ----

export async function POST(request: NextRequest) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  let body: AnalyticsReportRequest
  try {
    body = (await request.json()) as AnalyticsReportRequest
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { client_id, platform, period_start, period_end } = body
  if (!client_id || !platform || !period_start || !period_end) {
    return NextResponse.json(
      { error: 'client_id, platform, period_start, period_end are required' },
      { status: 400 }
    )
  }
  if (!['instagram', 'facebook'].includes(platform)) {
    return NextResponse.json({ error: 'platform must be instagram or facebook' }, { status: 400 })
  }

  const clientRow = await fetchClientWithOwnership(supabase, client_id, agencyId)
  if (!clientRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const clientName = clientRow.name

  // Get social connection for client + platform
  const { data: connection } = await supabase
    .from('social_connections')
    .select('account_id, access_token, token_expires_at')
    .eq('client_id', client_id)
    .eq('platform', platform)
    .single()

  if (!connection) {
    return NextResponse.json(
      { error: `No ${platform} account connected for this client` },
      { status: 422 }
    )
  }

  if (connection.token_expires_at && new Date(connection.token_expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'Access token expired. Please reconnect the account.' },
      { status: 422 }
    )
  }

  try {
    let metrics: InstagramMetrics | FacebookMetrics

    if (platform === 'instagram') {
      metrics = await fetchInstagramMetrics(
        connection.account_id!,
        connection.access_token!,
        period_start,
        period_end
      )
    } else {
      metrics = await fetchFacebookMetrics(
        connection.account_id!,
        connection.access_token!,
        period_start,
        period_end
      )
    }

    const aiSummary = await generateAnalyticsSummary({
      clientName,
      platform,
      startDate: period_start,
      endDate: period_end,
      metricsJson: metrics,
    })

    const { data: report, error: upsertError } = await supabase
      .from('analytics_reports')
      .upsert(
        {
          client_id,
          platform,
          period_start,
          period_end,
          metrics_json: JSON.parse(JSON.stringify(metrics)) as import('@/types/database').Json,
          ai_summary: aiSummary,
        },
        { onConflict: 'client_id,platform,period_start,period_end' }
      )
      .select()
      .single()

    if (upsertError) {
      console.error('Failed to save analytics report:', upsertError)
      return NextResponse.json({ error: 'Failed to save report' }, { status: 500 })
    }

    return NextResponse.json({ report })
  } catch (err) {
    console.error('Analytics report error:', err)
    const message = err instanceof Error ? err.message : 'Failed to fetch analytics data'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')
  const platform = searchParams.get('platform')

  if (!clientId) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
  }

  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const owned = await verifyClientOwnership(supabase, clientId, agencyId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let query = supabase
    .from('analytics_reports')
    .select('id, platform, period_start, period_end, ai_summary, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (platform) {
    query = query.eq('platform', platform)
  }

  const { data: reports, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ reports: reports ?? [] })
}

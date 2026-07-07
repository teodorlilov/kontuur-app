import type { AudienceDemographics, FBDailyInsight, FBPost, FacebookMetrics, MediaTypeBreakdownItem } from '@/types/api'
import { META_GRAPH_BASE } from '@/lib/meta/constants'
import {
  type AudienceApiData,
  type FBInsightData,
  buildAudienceDemographics,
  deltaPct,
  pivotFBInsights,
} from '@/lib/meta/aggregate-metrics'

const FB_INSIGHT_METRICS =
  'page_impressions,page_reach,page_engaged_users,page_views_total,page_fan_adds,page_fan_removes,page_organic_reach,page_paid_reach'

/** Fetches FB page fan/follower counts. */
async function fetchFBPage(
  pageId: string,
  token: string
): Promise<{ fan_count: number; followers_count: number }> {
  const res = await fetch(`${META_GRAPH_BASE}/${pageId}?fields=fan_count,followers_count&${token}`)
  if (!res.ok) throw new Error('Failed to fetch Facebook page data')
  return res.json() as Promise<{ fan_count: number; followers_count: number }>
}

/** Fetches daily FB page insights for a date range (unix timestamps). */
async function fetchFBDailyInsights(
  pageId: string,
  token: string,
  sinceTs: number,
  untilTs: number
): Promise<FBDailyInsight[]> {
  const res = await fetch(
    `${META_GRAPH_BASE}/${pageId}/insights?metric=${FB_INSIGHT_METRICS}&period=day&since=${sinceTs}&until=${untilTs}&${token}`
  )
  if (!res.ok) return []
  const body = (await res.json()) as { data: FBInsightData }
  return pivotFBInsights(body.data)
}

/** Fetches insight metrics for a single FB post. */
async function fetchSingleFBPostInsights(
  postId: string,
  token: string
): Promise<{ reactions: number; comments: number; shares: number; reach: number; impressions: number }> {
  const zero = { reactions: 0, comments: 0, shares: 0, reach: 0, impressions: 0 }
  try {
    const res = await fetch(
      `${META_GRAPH_BASE}/${postId}/insights?metric=post_reactions_by_type_total,post_comments,post_shares,post_reach,post_impressions&${token}`
    )
    if (!res.ok) return zero
    const body = (await res.json()) as {
      data: Array<{ name: string; values: Array<{ value: number | Record<string, number> }> }>
    }
    const result = { ...zero }
    for (const m of body.data) {
      const rawVal = m.values[0]?.value ?? 0
      if (m.name === 'post_reactions_by_type_total') {
        result.reactions =
          typeof rawVal === 'object'
            ? Object.values(rawVal).reduce((s, v) => s + (v as number), 0)
            : (rawVal as number)
      }
      if (m.name === 'post_comments') result.comments = rawVal as number
      if (m.name === 'post_shares') result.shares = rawVal as number
      if (m.name === 'post_reach') result.reach = rawVal as number
      if (m.name === 'post_impressions') result.impressions = rawVal as number
    }
    return result
  } catch {
    return zero
  }
}

/** Fetches posts in range with per-post insights (max 10, in parallel). */
async function fetchFBPosts(
  pageId: string,
  token: string,
  since: string,
  until: string
): Promise<FBPost[]> {
  const res = await fetch(
    `${META_GRAPH_BASE}/${pageId}/posts?fields=id,message,created_time&since=${since}&until=${until}&limit=25&${token}`
  )
  const body = res.ok
    ? ((await res.json()) as { data: Array<{ id: string; message?: string; created_time: string }> })
    : { data: [] }
  return Promise.all(
    body.data.slice(0, 10).map(async (post) => {
      const ins = await fetchSingleFBPostInsights(post.id, token)
      return {
        id: post.id,
        message: post.message ?? null,
        created_time: post.created_time,
        ...ins,
      }
    })
  )
}

/** Fetches equivalent previous period and returns sums for delta computation. */
async function fetchFBPrevPeriodDeltas(
  pageId: string,
  token: string,
  sinceTs: number,
  untilTs: number
): Promise<{ reach: number; impressions: number; newFollowers: number }> {
  try {
    const periodS = untilTs - sinceTs
    const prevInsights = await fetchFBDailyInsights(pageId, token, sinceTs - periodS, sinceTs)
    return {
      reach: prevInsights.reduce((s, d) => s + (d.reach ?? 0), 0),
      impressions: prevInsights.reduce((s, d) => s + (d.impressions ?? 0), 0),
      newFollowers: prevInsights.reduce((s, d) => s + (d.fan_adds ?? 0), 0),
    }
  } catch {
    return { reach: 0, impressions: 0, newFollowers: 0 }
  }
}

/** Fetches FB audience demographics (optional — may fail for small pages). */
async function fetchFBAudienceDemographics(
  pageId: string,
  token: string
): Promise<AudienceDemographics | null> {
  try {
    const res = await fetch(
      `${META_GRAPH_BASE}/${pageId}/insights?metric=page_fans_gender_age,page_fans_country,page_fans_city&period=lifetime&${token}`
    )
    if (!res.ok) return null
    const { data } = (await res.json()) as { data: AudienceApiData }
    return buildAudienceDemographics(data, 'page_fans_gender_age', 'page_fans_city', 'page_fans_country')
  } catch {
    return null
  }
}

/** Computes the media type breakdown; FB posts have no media_type, so all group under one bucket. */
function computeFBMediaTypeBreakdown(posts: FBPost[], fans: number): MediaTypeBreakdownItem[] {
  if (posts.length === 0) return []
  const totalER = posts.reduce(
    (s, p) => s + ((p.reactions + p.comments + p.shares) / fans) * 100,
    0
  )
  return [
    {
      type: 'Post',
      avg_engagement_rate: Math.round((totalER / posts.length) * 10) / 10,
      count: posts.length,
    },
  ]
}

/** Fetches all Facebook metrics for a client page and date range. */
export async function fetchFacebookMetrics(
  pageId: string,
  accessToken: string,
  since: string,
  until: string
): Promise<FacebookMetrics> {
  const token = `access_token=${accessToken}`
  // Insights API requires unix timestamps
  const sinceTs = Math.floor(new Date(since).getTime() / 1000)
  const untilTs = Math.floor(new Date(until).getTime() / 1000)

  const page = await fetchFBPage(pageId, token)
  const dailyInsights = await fetchFBDailyInsights(pageId, token, sinceTs, untilTs)
  const posts = await fetchFBPosts(pageId, token, since, until)
  const prevDeltas = await fetchFBPrevPeriodDeltas(pageId, token, sinceTs, untilTs)
  const audience = await fetchFBAudienceDemographics(pageId, token)

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
      organic_reach_pct: totalReach > 0 ? Math.round((totalOrganicReach / totalReach) * 100) : null,
      paid_reach_pct: totalReach > 0 ? Math.round((totalPaidReach / totalReach) * 100) : null,
      reach_delta_pct: deltaPct(totalReach, prevDeltas.reach),
      views_delta_pct: deltaPct(totalImpressions, prevDeltas.impressions),
      profile_views_delta_pct: null,
      followers_delta_pct: deltaPct(totalNewFollowers, prevDeltas.newFollowers),
      avg_save_rate: 0,
      total_saved: 0,
      total_shares: posts.reduce((s, p) => s + p.shares, 0),
    },
    daily_insights: dailyInsights,
    posts,
    audience,
    media_type_breakdown: computeFBMediaTypeBreakdown(posts, fans),
  }
}

import type { AudienceDemographics, IGDailyInsight, IGPost, InstagramMetrics } from '@/types/api'
import { IG_GRAPH_BASE } from '@/lib/meta/constants'
import {
  type AudienceApiData,
  type IGInsightData,
  type IGPrevPeriodDeltas,
  buildAudienceDemographics,
  buildIGSummary,
  computeIGMediaTypeBreakdown,
  computeIGPostAggregates,
  pivotIGInsights,
  sumIGDailyInsights,
} from '@/lib/meta/aggregate-metrics'

const IG_INSIGHT_METRICS =
  'reach,views,profile_views,follower_count,accounts_engaged,website_clicks,follows_and_unfollows'

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

/** Fetches all Instagram metrics for a client account and date range. */
export async function fetchInstagramMetrics(
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

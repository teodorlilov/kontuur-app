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

// ---- Instagram fetching ----

async function fetchInstagramMetrics(
  accountId: string,
  accessToken: string,
  since: string,
  until: string
): Promise<InstagramMetrics> {
  const token = `access_token=${accessToken}`
  const igBase = IG_GRAPH_BASE

  // Convert ISO dates to Unix timestamps (required by Insights API)
  const sinceTs = Math.floor(new Date(since).getTime() / 1000)
  const untilTs = Math.floor(new Date(until).getTime() / 1000)

  // Account summary
  const acctRes = await fetch(
    `${igBase}/${accountId}?fields=followers_count,follows_count,media_count&${token}`
  )
  if (!acctRes.ok) throw new Error('Failed to fetch Instagram account data')
  const account = (await acctRes.json()) as {
    followers_count: number
    follows_count: number
    media_count: number
  }

  // Daily insights (uses Unix timestamps)
  // Instagram Business Login API (graph.instagram.com) uses 'views' for impressions at account level
  const insightMetrics = 'reach,views,profile_views,follower_count'
  const insightRes = await fetch(
    `${igBase}/${accountId}/insights?metric=${insightMetrics}&period=day&since=${sinceTs}&until=${untilTs}&${token}`
  )
  let insightData: {
    data: Array<{ name: string; values: Array<{ value: number; end_time: string }> }>
  } = { data: [] }
  if (insightRes.ok) {
    insightData = (await insightRes.json()) as typeof insightData
    console.log(
      '[IG insights] metrics returned:',
      insightData.data.map((d) => `${d.name}(${d.values.length} days)`)
    )
  } else {
    const errText = await insightRes.text()
    console.error('[IG insights] fetch failed:', insightRes.status, errText)
  }

  // Pivot insights into daily map
  // Map 'views' (Instagram Business Login API name) → 'impressions' (our internal type)
  const igMetricKeyMap: Record<string, string> = { views: 'impressions' }
  const dailyMap: Record<string, Record<string, unknown>> = {}
  for (const metric of insightData.data) {
    const key = igMetricKeyMap[metric.name] ?? metric.name
    for (const entry of metric.values) {
      const date = entry.end_time.split('T')[0]!
      if (!dailyMap[date]) dailyMap[date] = { date }
      dailyMap[date]![key] = entry.value
    }
  }
  const dailyInsights = Object.values(dailyMap)
    .map((d) => d as unknown as IGDailyInsight)
    .sort((a, b) => a.date.localeCompare(b.date))

  // Fetch recent media and filter client-side by timestamp
  // (since/until on /media endpoint are pagination cursors, not date filters)
  const mediaRes = await fetch(
    `${igBase}/${accountId}/media?fields=id,caption,timestamp,media_type,like_count,comments_count,permalink,thumbnail_url,media_url&limit=50&${token}`
  )
  const mediaData = mediaRes.ok
    ? ((await mediaRes.json()) as {
        data: Array<{
          id: string
          caption?: string
          timestamp: string
          media_type: string
          like_count: number
          comments_count: number
          permalink?: string
          thumbnail_url?: string
          media_url?: string
        }>
      })
    : { data: [] }

  // Filter to posts within the selected date range
  const sinceDate = new Date(since)
  const untilDate = new Date(until)
  untilDate.setHours(23, 59, 59, 999)
  const filteredMedia = mediaData.data.filter((m) => {
    const t = new Date(m.timestamp)
    return t >= sinceDate && t <= untilDate
  })

  // Per-post insights (max 20) — all fetches run in parallel
  const posts: IGPost[] = await Promise.all(
    filteredMedia.slice(0, 20).map(async (media) => {
      let saved = 0
      let reach = 0
      let impressions = 0
      try {
        const postInsightRes = await fetch(
          `${igBase}/${media.id}/insights?metric=saved,reach,views&${token}`
        )
        if (postInsightRes.ok) {
          const postInsight = (await postInsightRes.json()) as {
            data: Array<{ name: string; values: Array<{ value: number }> }>
          }
          for (const m of postInsight.data) {
            const val = m.values[0]?.value ?? 0
            if (m.name === 'saved') saved = val
            if (m.name === 'reach') reach = val
            if (m.name === 'views') impressions = val // 'views' = impressions in new API
          }
        }
      } catch {
        /* ignore individual post errors */
      }
      return {
        id: media.id,
        caption: media.caption ?? null,
        timestamp: media.timestamp,
        media_type: media.media_type,
        like_count: media.like_count,
        comments_count: media.comments_count,
        saved,
        reach,
        impressions,
        permalink: media.permalink,
        thumbnail_url: media.thumbnail_url ?? media.media_url ?? null,
      }
    })
  )

  // Compute summary
  const totalReach = dailyInsights.reduce((sum, d) => sum + (d.reach ?? 0), 0)
  const totalImpressions = dailyInsights.reduce((sum, d) => sum + (d.impressions ?? 0), 0)
  const totalProfileViews = dailyInsights.reduce((sum, d) => sum + (d.profile_views ?? 0), 0)

  const followers = account.followers_count || 1
  const totalEngagements = posts.reduce((sum, p) => sum + p.like_count + p.comments_count, 0)
  const avgEngagementRate =
    posts.length > 0 ? Math.round((totalEngagements / posts.length / followers) * 1000) / 10 : 0

  // Compute new followers / unfollowers from daily follower_count snapshots
  const followerSeries = dailyInsights
    .filter((d) => d.follower_count != null)
    .sort((a, b) => a.date.localeCompare(b.date))
  let newFollowers = 0
  let unfollowersCount = 0
  for (let i = 1; i < followerSeries.length; i++) {
    const curr = followerSeries[i]?.follower_count ?? 0
    const prev = followerSeries[i - 1]?.follower_count ?? 0
    const delta = curr - prev
    if (delta > 0) newFollowers += delta
    else unfollowersCount += Math.abs(delta)
  }

  // Fetch previous period for delta computation
  const periodMs = new Date(until).getTime() - new Date(since).getTime()
  const prevSinceTsIg = Math.floor((new Date(since).getTime() - periodMs) / 1000)
  const prevUntilTsIg = sinceTs
  let prevTotalReach = 0
  let prevTotalImpressions = 0
  let prevTotalProfileViews = 0
  let prevNewFollowers = 0
  try {
    const prevInsightRes = await fetch(
      `${igBase}/${accountId}/insights?metric=${insightMetrics}&period=day&since=${prevSinceTsIg}&until=${prevUntilTsIg}&${token}`
    )
    if (prevInsightRes.ok) {
      const prevInsightData = (await prevInsightRes.json()) as {
        data: Array<{ name: string; values: Array<{ value: number; end_time: string }> }>
      }
      const prevDailyMap: Record<string, Record<string, unknown>> = {}
      for (const metric of prevInsightData.data) {
        const key = igMetricKeyMap[metric.name] ?? metric.name
        for (const entry of metric.values) {
          const date = entry.end_time.split('T')[0]!
          if (!prevDailyMap[date]) prevDailyMap[date] = { date }
          prevDailyMap[date]![key] = entry.value
        }
      }
      const prevInsights = Object.values(prevDailyMap).map((d) => d as unknown as IGDailyInsight)
      prevTotalReach = prevInsights.reduce((s, d) => s + (d.reach ?? 0), 0)
      prevTotalImpressions = prevInsights.reduce((s, d) => s + (d.impressions ?? 0), 0)
      prevTotalProfileViews = prevInsights.reduce((s, d) => s + (d.profile_views ?? 0), 0)
      const prevFollowerSeries = prevInsights
        .filter((d) => d.follower_count != null)
        .sort((a, b) => a.date.localeCompare(b.date))
      for (let i = 1; i < prevFollowerSeries.length; i++) {
        const c = prevFollowerSeries[i]?.follower_count ?? 0
        const p = prevFollowerSeries[i - 1]?.follower_count ?? 0
        if (c - p > 0) prevNewFollowers += c - p
      }
    }
  } catch {
    /* delta is optional */
  }

  // Media type breakdown (no extra API call)
  const mediaTypeMap: Record<string, { totalER: number; count: number }> = {}
  for (const post of posts) {
    const denominator = post.reach && post.reach > 0 ? post.reach : followers
    const er = ((post.like_count + post.comments_count) / denominator) * 100
    if (!mediaTypeMap[post.media_type]) mediaTypeMap[post.media_type] = { totalER: 0, count: 0 }
    mediaTypeMap[post.media_type]!.totalER += er
    mediaTypeMap[post.media_type]!.count++
  }
  const media_type_breakdown: MediaTypeBreakdownItem[] = Object.entries(mediaTypeMap)
    .map(([type, d]) => ({
      type,
      avg_engagement_rate: Math.round((d.totalER / d.count) * 10) / 10,
      count: d.count,
    }))
    .sort((a, b) => b.avg_engagement_rate - a.avg_engagement_rate)

  const totalSaved = posts.reduce((s, p) => s + (p.saved ?? 0), 0)
  const totalReachForSR = posts.reduce((s, p) => s + (p.reach ?? 0), 0)
  const avg_save_rate =
    totalReachForSR > 0 ? Math.round((totalSaved / totalReachForSR) * 1000) / 10 : 0

  // Audience demographics (optional — may fail for small/non-business accounts)
  let audience: AudienceDemographics | null = null
  try {
    const audienceRes = await fetch(
      `${igBase}/${accountId}/insights?metric=audience_gender_age,audience_city,audience_country&period=lifetime&${token}`
    )
    if (audienceRes.ok) {
      const { data } = (await audienceRes.json()) as { data: AudienceApiData }
      audience = buildAudienceDemographics(
        data,
        'audience_gender_age',
        'audience_city',
        'audience_country'
      )
    }
  } catch {
    /* audience data is optional */
  }

  return {
    platform: 'instagram',
    account: {
      followers_count: account.followers_count,
      follows_count: account.follows_count,
      media_count: account.media_count,
    },
    summary: {
      total_reach: totalReach,
      total_impressions: totalImpressions,
      total_profile_views: totalProfileViews,
      avg_engagement_rate: avgEngagementRate,
      posts_published: posts.length,
      new_followers: newFollowers,
      unfollowers: unfollowersCount,
      organic_reach_pct: null,
      paid_reach_pct: null,
      reach_delta_pct: deltaPct(totalReach, prevTotalReach),
      views_delta_pct: deltaPct(totalImpressions, prevTotalImpressions),
      profile_views_delta_pct: deltaPct(totalProfileViews, prevTotalProfileViews),
      followers_delta_pct: deltaPct(newFollowers, prevNewFollowers),
      avg_save_rate,
      total_saved: totalSaved,
      total_shares: 0,
    },
    daily_insights: dailyInsights,
    posts,
    audience,
    media_type_breakdown,
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

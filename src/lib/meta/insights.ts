import 'server-only'

import { createSemaphore } from '@/lib/concurrency'
import { graphGet } from './graph-client'
import { GraphApiError } from './graph-errors'
import { IG_GRAPH_BASE } from './constants'
import {
  igAccountFieldsSchema,
  igInsightsEnvelopeSchema,
  igMediaListSchema,
  type IGMediaItem,
  type IGMediaListPage,
} from './schemas'
import { breakdownMapOf, dailySeriesOf, lifetimeValueOf, totalValueOf } from './insight-values'

/**
 * Instagram insights fetch layer. Every call shape here is the EMPIRICAL Graph
 * v25 contract verified live (memory: project_meta_probe_results), not Meta's
 * docs: Bearer-header auth, singular `breakdown`, `metric_type=total_value`
 * required for non-series account metrics, and silent-empty `{"data":[]}` HTTP
 * 200 meaning "unavailable" — mapped to null, never 0. Nothing here swallows
 * errors: GraphApiError propagates to the caller's boundary.
 */

function insightsUrl(accountId: string): string {
  return `${IG_GRAPH_BASE}/${accountId}/insights`
}

function rangeParams(sinceTs: number, untilTs: number): Record<string, string> {
  return { since: String(sinceTs), until: String(untilTs) }
}

/** The account's current follower/following/media totals. */
export function fetchAccountFields(
  accountId: string,
  accessToken: string
): Promise<{ followers_count: number; follows_count: number; media_count: number }> {
  return graphGet(igAccountFieldsSchema, `${IG_GRAPH_BASE}/${accountId}`, accessToken, {
    fields: 'followers_count,follows_count,media_count',
  })
}

/** Daily account reach over the range, bucketed to YYYY-MM-DD; empty when the API served nothing. */
export async function fetchDailyReachSeries(
  accountId: string,
  accessToken: string,
  sinceTs: number,
  untilTs: number
): Promise<Array<{ date: string; reach: number }>> {
  const body = await graphGet(igInsightsEnvelopeSchema, insightsUrl(accountId), accessToken, {
    metric: 'reach',
    period: 'day',
    metric_type: 'time_series',
    ...rangeParams(sinceTs, untilTs),
  })
  return dailySeriesOf(body.data, 'reach').map(({ date, value }) => ({ date, reach: value }))
}

/** The nine metrics the probe verified in ONE total_value call. */
const DAY_TOTAL_METRICS =
  'views,accounts_engaged,total_interactions,likes,comments,saves,shares,replies,reposts'

export interface IGDayTotals {
  views: number | null
  accounts_engaged: number | null
  total_interactions: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  shares: number | null
  replies: number | null
  reposts: number | null
  profile_views: number | null
  website_clicks: number | null
}

/** Account totals over the range — one call for the nine-metric batch plus one for profile_views/website_clicks. */
export async function fetchDayTotals(
  accountId: string,
  accessToken: string,
  sinceTs: number,
  untilTs: number
): Promise<IGDayTotals> {
  const shared = { period: 'day', metric_type: 'total_value', ...rangeParams(sinceTs, untilTs) }
  const [batch, profile] = await Promise.all([
    graphGet(igInsightsEnvelopeSchema, insightsUrl(accountId), accessToken, {
      metric: DAY_TOTAL_METRICS,
      ...shared,
    }),
    graphGet(igInsightsEnvelopeSchema, insightsUrl(accountId), accessToken, {
      metric: 'profile_views,website_clicks',
      ...shared,
    }),
  ])
  return {
    views: totalValueOf(batch.data, 'views'),
    accounts_engaged: totalValueOf(batch.data, 'accounts_engaged'),
    total_interactions: totalValueOf(batch.data, 'total_interactions'),
    likes: totalValueOf(batch.data, 'likes'),
    comments: totalValueOf(batch.data, 'comments'),
    saves: totalValueOf(batch.data, 'saves'),
    shares: totalValueOf(batch.data, 'shares'),
    replies: totalValueOf(batch.data, 'replies'),
    reposts: totalValueOf(batch.data, 'reposts'),
    profile_views: totalValueOf(profile.data, 'profile_views'),
    website_clicks: totalValueOf(profile.data, 'website_clicks'),
  }
}

/**
 * Follows/unfollows over the range via breakdown=follow_type — the breakdown is
 * mandatory (without it the entry carries no total_value at all). The probe
 * recorded dimension_values ["FOLLOWER"] and ["NON_FOLLOWER"]; reading: FOLLOWER
 * counts accounts that became followers, NON_FOLLOWER accounts that stopped.
 * The probe supports it — the same week's follower_count delta series summed to
 * 5, exactly the FOLLOWER value (NON_FOLLOWER read 3). ≥100-follower gated
 * (silent-empty below), so absence maps to null.
 */
export async function fetchFollowsBreakdown(
  accountId: string,
  accessToken: string,
  sinceTs: number,
  untilTs: number
): Promise<{ follows: number | null; unfollows: number | null }> {
  const body = await graphGet(igInsightsEnvelopeSchema, insightsUrl(accountId), accessToken, {
    metric: 'follows_and_unfollows',
    period: 'day',
    metric_type: 'total_value',
    breakdown: 'follow_type',
    ...rangeParams(sinceTs, untilTs),
  })
  const map = breakdownMapOf(body.data, 'follows_and_unfollows')
  if (!map) return { follows: null, unfollows: null }
  return { follows: map['FOLLOWER'] ?? null, unfollows: map['NON_FOLLOWER'] ?? null }
}

/** Profile link taps over the range: the total and its contact_button_type split. */
export async function fetchLinkTaps(
  accountId: string,
  accessToken: string,
  sinceTs: number,
  untilTs: number
): Promise<{ total: number | null; byButton: Record<string, number> | null }> {
  const body = await graphGet(igInsightsEnvelopeSchema, insightsUrl(accountId), accessToken, {
    metric: 'profile_links_taps',
    period: 'day',
    metric_type: 'total_value',
    breakdown: 'contact_button_type',
    ...rangeParams(sinceTs, untilTs),
  })
  return {
    total: totalValueOf(body.data, 'profile_links_taps'),
    byButton: breakdownMapOf(body.data, 'profile_links_taps'),
  }
}

async function fetchProductTypeBreakdown(
  accountId: string,
  accessToken: string,
  metric: 'reach' | 'total_interactions',
  sinceTs: number,
  untilTs: number
): Promise<Record<string, number> | null> {
  const body = await graphGet(igInsightsEnvelopeSchema, insightsUrl(accountId), accessToken, {
    metric,
    period: 'day',
    metric_type: 'total_value',
    breakdown: 'media_product_type',
    ...rangeParams(sinceTs, untilTs),
  })
  return breakdownMapOf(body.data, metric)
}

/**
 * Reach split by the insights product-type enum (POST/REEL/AD/CAROUSEL_CONTAINER/
 * STORY — NOT /media's FEED/REELS; AD is paid reach mixed in). Null when unavailable.
 */
export function fetchReachByProductType(
  accountId: string,
  accessToken: string,
  sinceTs: number,
  untilTs: number
): Promise<Record<string, number> | null> {
  return fetchProductTypeBreakdown(accountId, accessToken, 'reach', sinceTs, untilTs)
}

/**
 * Interactions split by product type. Untested in the original probe; verified
 * live 2026-08-19 on the real account (POST/REEL/STORY/AD populated, HTTP 200).
 */
export function fetchInteractionsByProductType(
  accountId: string,
  accessToken: string,
  sinceTs: number,
  untilTs: number
): Promise<Record<string, number> | null> {
  return fetchProductTypeBreakdown(accountId, accessToken, 'total_interactions', sinceTs, untilTs)
}

/**
 * follower_count per day — the DAILY NEW-FOLLOWERS DELTA, not a cumulative total
 * (probe-verified). ≥100-follower gated, so an empty array means unavailable.
 */
export async function fetchFollowerDeltaSeries(
  accountId: string,
  accessToken: string,
  sinceTs: number,
  untilTs: number
): Promise<Array<{ date: string; delta: number }>> {
  const body = await graphGet(igInsightsEnvelopeSchema, insightsUrl(accountId), accessToken, {
    metric: 'follower_count',
    period: 'day',
    ...rangeParams(sinceTs, untilTs),
  })
  return dailySeriesOf(body.data, 'follower_count').map(({ date, value }) => ({
    date,
    delta: value,
  }))
}

export type IGDemographicKind = 'follower_demographics' | 'engaged_audience_demographics'

export interface IGDemographics {
  age: Record<string, number>
  gender: Record<string, number>
  city: Record<string, number>
  country: Record<string, number>
}

const DEMOGRAPHIC_DIMENSIONS = ['age', 'gender', 'city', 'country'] as const

// The probe's verified timeframe per kind (its live 400 listed the valid set:
// last_90_days, this_week, prev_month, this_month, last_30_days, last_14_days).
const DEMOGRAPHIC_TIMEFRAME: Record<IGDemographicKind, string> = {
  follower_demographics: 'this_month',
  engaged_audience_demographics: 'last_90_days',
}

/**
 * One demographics kind via four breakdown calls (age|gender|city|country — one
 * breakdown per call is the only accepted form). Age buckets are 13-17…65+,
 * gender F/M/U, city localized "City, Province" strings, country ISO-2. Null
 * when all four come back empty (accounts under the demographics floor).
 */
export async function fetchDemographics(
  accountId: string,
  accessToken: string,
  kind: IGDemographicKind
): Promise<IGDemographics | null> {
  const [age, gender, city, country] = await Promise.all(
    DEMOGRAPHIC_DIMENSIONS.map(async (dimension) => {
      const body = await graphGet(igInsightsEnvelopeSchema, insightsUrl(accountId), accessToken, {
        metric: kind,
        period: 'lifetime',
        metric_type: 'total_value',
        timeframe: DEMOGRAPHIC_TIMEFRAME[kind],
        breakdown: dimension,
      })
      return breakdownMapOf(body.data, kind)
    })
  )
  if (!age && !gender && !city && !country) return null
  return { age: age ?? {}, gender: gender ?? {}, city: city ?? {}, country: country ?? {} }
}

const MEDIA_FIELDS =
  'id,caption,media_type,media_product_type,timestamp,like_count,comments_count,permalink,thumbnail_url,media_url'
const MEDIA_PAGE_SIZE = 50

/**
 * Media newer than sinceIso, following paging.next up to maxPages. The next URL
 * works as-is under Bearer auth (probe P2a) — graphGet re-attaches the header.
 * The list arrives newest-first, so the walk stops at the first older item.
 */
export async function fetchMediaSince(
  accountId: string,
  accessToken: string,
  sinceIso: string,
  { maxPages = 10 }: { maxPages?: number } = {}
): Promise<IGMediaItem[]> {
  const sinceMs = new Date(sinceIso).getTime()
  const collected: IGMediaItem[] = []
  let nextUrl: string | null = `${IG_GRAPH_BASE}/${accountId}/media`
  let params: Record<string, string> | undefined = {
    fields: MEDIA_FIELDS,
    limit: String(MEDIA_PAGE_SIZE),
  }

  for (let page = 0; page < maxPages && nextUrl; page++) {
    // Annotated: `nextUrl` feeds back from the previous page's body, and TS
    // refuses to infer through that cycle.
    const body: IGMediaListPage = await graphGet(igMediaListSchema, nextUrl, accessToken, params)
    for (const item of body.data ?? []) {
      const postedMs = item.timestamp ? new Date(item.timestamp).getTime() : Number.NaN
      if (!Number.isNaN(postedMs) && postedMs < sinceMs) return collected
      collected.push(item)
    }
    nextUrl = body.paging?.next ?? null
    params = undefined
  }
  return collected
}

const MEDIA_INSIGHT_METRICS_ALL =
  'reach,views,saved,shares,total_interactions,likes,comments,follows,profile_visits'
const MEDIA_INSIGHT_METRICS_UNIVERSAL = 'reach,views,saved,shares,total_interactions,likes,comments'

export interface IGMediaInsights {
  reach: number | null
  views: number | null
  saved: number | null
  shares: number | null
  total_interactions: number | null
  likes: number | null
  comments: number | null
  follows: number | null
  profile_visits: number | null
}

/** The API's "this metric does not exist for this media product type" rejection — and only that. */
function isUnsupportedMetricRejection(err: unknown): boolean {
  return (
    err instanceof GraphApiError &&
    err.shape.code === 100 &&
    /does not support the .+ metric/i.test(err.shape.message)
  )
}

async function fetchMediaInsightsEnvelope(mediaId: string, accessToken: string) {
  const url = `${IG_GRAPH_BASE}/${mediaId}/insights`
  try {
    return await graphGet(igInsightsEnvelopeSchema, url, accessToken, {
      metric: MEDIA_INSIGHT_METRICS_ALL,
    })
  } catch (err) {
    // Not a swallow: only the deterministic per-media-type rejection falls
    // through to the universal set; every other failure still propagates.
    if (!isUnsupportedMetricRejection(err)) throw err
    return graphGet(igInsightsEnvelopeSchema, url, accessToken, {
      metric: MEDIA_INSIGHT_METRICS_UNIVERSAL,
    })
  }
}

/**
 * Lifetime insights for one media item — note `saved` (media) vs `saves`
 * (account). Combined-call decision, verified live 2026-08-19 on the real
 * account: ONE nine-metric call succeeds on FEED media (IMAGE and
 * CAROUSEL_ALBUM), but REELS reject follows/profile_visits outright (code 100
 * "does not support … for this media product type") — combined AND alone. So
 * the nine-metric call is tried first; on exactly that rejection the seven
 * universal metrics are refetched (one extra call per reel) and
 * follows/profile_visits read null, which is the truth for those media.
 */
export async function fetchMediaInsights(
  mediaId: string,
  accessToken: string
): Promise<IGMediaInsights> {
  const body = await fetchMediaInsightsEnvelope(mediaId, accessToken)
  return {
    reach: lifetimeValueOf(body.data, 'reach'),
    views: lifetimeValueOf(body.data, 'views'),
    saved: lifetimeValueOf(body.data, 'saved'),
    shares: lifetimeValueOf(body.data, 'shares'),
    total_interactions: lifetimeValueOf(body.data, 'total_interactions'),
    likes: lifetimeValueOf(body.data, 'likes'),
    comments: lifetimeValueOf(body.data, 'comments'),
    follows: lifetimeValueOf(body.data, 'follows'),
    profile_visits: lifetimeValueOf(body.data, 'profile_visits'),
  }
}

/** Bounded so a 50-post sync does not fire 50 concurrent Graph calls. */
const MEDIA_INSIGHTS_CONCURRENCY = 3

/** Insights for many media ids at bounded concurrency, order-preserving. */
export async function fetchManyMediaInsights(
  mediaIds: string[],
  accessToken: string
): Promise<IGMediaInsights[]> {
  const semaphore = createSemaphore(MEDIA_INSIGHTS_CONCURRENCY)
  return Promise.all(
    mediaIds.map(async (mediaId) => {
      const release = await semaphore.acquire()
      try {
        return await fetchMediaInsights(mediaId, accessToken)
      } finally {
        release()
      }
    })
  )
}

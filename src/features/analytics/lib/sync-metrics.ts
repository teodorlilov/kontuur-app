import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { GraphApiError } from '@/lib/meta/graph-errors'
import {
  fetchAccountFields,
  fetchDailyReachSeries,
  fetchDayTotals,
  fetchDemographics,
  fetchFollowerDeltaSeries,
  fetchFollowsBreakdown,
  fetchInteractionsByProductType,
  fetchLinkTaps,
  fetchManyMediaInsights,
  fetchMediaSince,
  fetchReachByProductType,
  type IGDemographics,
} from '@/lib/meta/insights'
import { insertClientNotificationOnce } from '@/features/publishing/lib/notifications'
import { SOCIAL_CONNECTION_SYNC_COLUMNS } from '@/lib/queries/select-columns'
import { MS_PER_DAY } from '@/utils/constants'

/**
 * The nightly Instagram metrics capture. One rule governs every write: NULL
 * means "the API had nothing" and 0 means the API said 0 — the probe's core
 * lesson (silent-empty HTTP 200s are the Graph API's failure mode), and the
 * reason every metric column in the 20260822 tables is nullable.
 */

const DEMOGRAPHICS_REFRESH_DAYS = 7
const BACKFILL_DAYS = 30
const MEDIA_LOOKBACK_DAYS = 30
const SECONDS_PER_DAY = 86_400

/*
 * WHY hand-held row shapes + untyped SupabaseClient below: the 20260822 tables
 * are not in src/types/database.ts yet — the generated file comes from the
 * linked LIVE database (docs/DB-GEN-TYPES.md) and the migration has not reached
 * prod. Same established pattern as fetchClientPostStats. Once the migration is
 * applied and types are regenerated, derive these from the generated rows and
 * drop the casts in this file.
 */

interface IGAccountMetricsInsert {
  client_id: string
  metric_date: string
  followers_count?: number | null
  follows_count?: number | null
  media_count?: number | null
  reach?: number | null
  views?: number | null
  accounts_engaged?: number | null
  total_interactions?: number | null
  likes?: number | null
  comments?: number | null
  saves?: number | null
  shares?: number | null
  replies?: number | null
  reposts?: number | null
  profile_views?: number | null
  website_clicks?: number | null
  follows?: number | null
  unfollows?: number | null
  profile_links_taps?: number | null
  reach_by_media_product_type?: Record<string, number> | null
  interactions_by_media_product_type?: Record<string, number> | null
  link_taps_by_button_type?: Record<string, number> | null
  fetched_at?: string
}

interface IGPostMetricsInsert {
  client_id: string
  post_id: string | null
  ig_media_id: string
  media_type: string | null
  media_product_type: string | null
  permalink: string | null
  thumbnail_url: string | null
  caption: string | null
  posted_at: string | null
  reach: number | null
  views: number | null
  like_count: number | null
  comments_count: number | null
  saved: number | null
  shares: number | null
  total_interactions: number | null
  follows: number | null
  profile_visits: number | null
  last_synced_at: string
}

interface IGConnection {
  client_id: string
  account_id: string
  access_token: string
}

export interface MetricsSyncOutcome {
  synced: number
  skipped: number
  failed: number
  errors: Array<{ clientId: string; error: string }>
}

/**
 * Syncs yesterday's account metrics, per-post insights and (weekly)
 * demographics for every client with a live Instagram connection. Per-client
 * failures are contained: dead tokens notify the agency and move on, one
 * rate-limit answer stops the whole run (tomorrow retries), anything else
 * skips just that client.
 */
export async function syncAllClientMetrics(
  admin: SupabaseClient,
  { timeBudgetMs }: { timeBudgetMs: number }
): Promise<MetricsSyncOutcome> {
  const startedAt = Date.now()
  const outcome: MetricsSyncOutcome = { synced: 0, skipped: 0, failed: 0, errors: [] }

  const { data, error } = await admin
    .from('social_connections')
    .select(SOCIAL_CONNECTION_SYNC_COLUMNS)
    .eq('platform', 'instagram')
    .not('access_token', 'is', null)
    .not('account_id', 'is', null)
  if (error) throw new Error(`connection roster query failed: ${error.message}`)
  // WHY as: explicit column projection over the untyped admin handle (see header).
  const connections = (data ?? []) as IGConnection[]

  for (const [index, connection] of connections.entries()) {
    // Between clients, not inside one: a client either syncs whole or not at all.
    if (Date.now() - startedAt > timeBudgetMs) {
      outcome.skipped += connections.length - index
      break
    }
    try {
      await syncClientMetrics(admin, connection)
      outcome.synced++
    } catch (err) {
      outcome.failed++
      outcome.errors.push({
        clientId: connection.client_id,
        error: err instanceof Error ? err.message : 'unknown error',
      })
      if (err instanceof GraphApiError) {
        if (err.failure === 'token_invalid' || err.failure === 'permission') {
          try {
            await notifyMetricsBlocked(admin, connection.client_id)
          } catch (notifyErr) {
            outcome.errors.push({
              clientId: connection.client_id,
              error: `notify failed: ${notifyErr instanceof Error ? notifyErr.message : 'unknown'}`,
            })
          }
          continue
        }
        // One rate-limit answer poisons every remaining call in this run.
        if (err.failure === 'rate_limited') {
          outcome.skipped += connections.length - index - 1
          break
        }
      }
      // transient / permanent / non-Graph: on to the next client.
    }
  }
  return outcome
}

async function syncClientMetrics(admin: SupabaseClient, connection: IGConnection): Promise<void> {
  const { client_id: clientId, account_id: accountId, access_token: accessToken } = connection
  // Read the history flag BEFORE writing yesterday's row, or it is never zero.
  const hadHistory = await hasAccountHistory(admin, clientId)
  await syncAccountDay(admin, clientId, accountId, accessToken)
  if (!hadHistory) await backfillAccountHistory(admin, clientId, accountId, accessToken)
  await syncPostMetrics(admin, clientId, accountId, accessToken)
  await syncDemographicsWeekly(admin, clientId, accountId, accessToken)
}

async function hasAccountHistory(admin: SupabaseClient, clientId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('ig_account_metrics')
    .select('id')
    .eq('client_id', clientId)
    .limit(1)
  if (error) throw new Error(`ig_account_metrics lookup failed: ${error.message}`)
  return (data ?? []).length > 0
}

/** Yesterday as a UTC calendar day: its date label and [start, end) unix bounds. */
function yesterdayUtcWindow(): { date: string; sinceTs: number; untilTs: number } {
  const todayStartMs = new Date().setUTCHours(0, 0, 0, 0)
  const startMs = todayStartMs - MS_PER_DAY
  return {
    date: new Date(startMs).toISOString().slice(0, 10),
    sinceTs: Math.floor(startMs / 1000),
    untilTs: Math.floor(todayStartMs / 1000),
  }
}

/** Writes yesterday's full account row — seven independent fetches in parallel. */
async function syncAccountDay(
  admin: SupabaseClient,
  clientId: string,
  accountId: string,
  accessToken: string
): Promise<void> {
  const window = yesterdayUtcWindow()
  const [account, reachSeries, totals, followsSplit, linkTaps, reachByType, interactionsByType] =
    await Promise.all([
      fetchAccountFields(accountId, accessToken),
      fetchDailyReachSeries(accountId, accessToken, window.sinceTs, window.untilTs),
      fetchDayTotals(accountId, accessToken, window.sinceTs, window.untilTs),
      fetchFollowsBreakdown(accountId, accessToken, window.sinceTs, window.untilTs),
      fetchLinkTaps(accountId, accessToken, window.sinceTs, window.untilTs),
      fetchReachByProductType(accountId, accessToken, window.sinceTs, window.untilTs),
      fetchInteractionsByProductType(accountId, accessToken, window.sinceTs, window.untilTs),
    ])

  const row: IGAccountMetricsInsert = {
    client_id: clientId,
    metric_date: window.date,
    followers_count: account.followers_count,
    follows_count: account.follows_count,
    media_count: account.media_count,
    // An empty series is the API's silent-empty — null, never 0.
    reach: reachSeries.length > 0 ? reachSeries.reduce((sum, day) => sum + day.reach, 0) : null,
    views: totals.views,
    accounts_engaged: totals.accounts_engaged,
    total_interactions: totals.total_interactions,
    likes: totals.likes,
    comments: totals.comments,
    saves: totals.saves,
    shares: totals.shares,
    replies: totals.replies,
    reposts: totals.reposts,
    profile_views: totals.profile_views,
    website_clicks: totals.website_clicks,
    follows: followsSplit.follows,
    unfollows: followsSplit.unfollows,
    profile_links_taps: linkTaps.total,
    reach_by_media_product_type: reachByType,
    interactions_by_media_product_type: interactionsByType,
    link_taps_by_button_type: linkTaps.byButton,
    fetched_at: new Date().toISOString(),
  }
  const { error } = await admin
    .from('ig_account_metrics')
    .upsert(row, { onConflict: 'client_id,metric_date' })
  if (error) throw new Error(`ig_account_metrics upsert failed: ${error.message}`)
}

/**
 * First sync only: seed the trailing 30 days with what the API can still serve
 * per-day — reach and the new-follower delta. Every other column stays NULL;
 * historical day totals are not reconstructable. Yesterday already has its full
 * row, so it is excluded, and ignoreDuplicates keeps this from ever downgrading
 * a richer row in a race.
 */
async function backfillAccountHistory(
  admin: SupabaseClient,
  clientId: string,
  accountId: string,
  accessToken: string
): Promise<void> {
  const window = yesterdayUtcWindow()
  const sinceTs = window.untilTs - BACKFILL_DAYS * SECONDS_PER_DAY
  const [reachSeries, deltaSeries] = await Promise.all([
    fetchDailyReachSeries(accountId, accessToken, sinceTs, window.untilTs),
    fetchFollowerDeltaSeries(accountId, accessToken, sinceTs, window.untilTs),
  ])

  // Uniform keys per row — PostgREST rejects ragged bulk inserts.
  const byDate = new Map<string, IGAccountMetricsInsert>()
  const rowFor = (date: string): IGAccountMetricsInsert => {
    let row = byDate.get(date)
    if (!row) {
      row = { client_id: clientId, metric_date: date, reach: null, follows: null }
      byDate.set(date, row)
    }
    return row
  }
  for (const day of reachSeries) rowFor(day.date).reach = day.reach
  for (const day of deltaSeries) rowFor(day.date).follows = day.delta
  byDate.delete(window.date)
  if (byDate.size === 0) return

  const { error } = await admin
    .from('ig_account_metrics')
    .upsert([...byDate.values()], { onConflict: 'client_id,metric_date', ignoreDuplicates: true })
  if (error) throw new Error(`ig_account_metrics backfill failed: ${error.message}`)
}

/** Refreshes lifetime insights for the last 30 days of media and links them to Postflow posts. */
async function syncPostMetrics(
  admin: SupabaseClient,
  clientId: string,
  accountId: string,
  accessToken: string
): Promise<void> {
  const sinceIso = new Date(Date.now() - MEDIA_LOOKBACK_DAYS * MS_PER_DAY).toISOString()
  const media = await fetchMediaSince(accountId, accessToken, sinceIso)
  if (media.length === 0) return

  const [insightsList, postIdByMediaId] = await Promise.all([
    fetchManyMediaInsights(
      media.map((item) => item.id),
      accessToken
    ),
    fetchPostIdsByMediaId(
      admin,
      clientId,
      media.map((item) => item.id)
    ),
  ])

  const now = new Date().toISOString()
  const rows: IGPostMetricsInsert[] = media.map((item, index) => {
    const insights = insightsList[index]!
    return {
      client_id: clientId,
      post_id: postIdByMediaId.get(item.id) ?? null,
      ig_media_id: item.id,
      media_type: item.media_type ?? null,
      media_product_type: item.media_product_type ?? null,
      permalink: item.permalink ?? null,
      // thumbnail_url is video-only on /media; the image itself fills in elsewhere.
      thumbnail_url: item.thumbnail_url ?? item.media_url ?? null,
      caption: item.caption ?? null,
      posted_at: item.timestamp ?? null,
      reach: insights.reach,
      views: insights.views,
      like_count: item.like_count ?? null,
      comments_count: item.comments_count ?? null,
      saved: insights.saved,
      shares: insights.shares,
      total_interactions: insights.total_interactions,
      follows: insights.follows,
      profile_visits: insights.profile_visits,
      last_synced_at: now,
    }
  })

  const { error } = await admin
    .from('ig_post_metrics')
    .upsert(rows, { onConflict: 'client_id,ig_media_id' })
  if (error) throw new Error(`ig_post_metrics upsert failed: ${error.message}`)
}

async function fetchPostIdsByMediaId(
  admin: SupabaseClient,
  clientId: string,
  mediaIds: string[]
): Promise<Map<string, string>> {
  const { data, error } = await admin
    .from('posts')
    .select('id, ig_media_id')
    .eq('client_id', clientId)
    .in('ig_media_id', mediaIds)
  if (error) throw new Error(`posts join query failed: ${error.message}`)
  // WHY as: explicit column projection over the untyped admin handle (see header).
  const rows = (data ?? []) as Array<{ id: string; ig_media_id: string | null }>
  return new Map(
    rows.flatMap((row) => (row.ig_media_id ? [[row.ig_media_id, row.id] as const] : []))
  )
}

/** At most one demographics snapshot per week — eight breakdown calls are not free. */
async function syncDemographicsWeekly(
  admin: SupabaseClient,
  clientId: string,
  accountId: string,
  accessToken: string
): Promise<void> {
  const cutoff = new Date(Date.now() - DEMOGRAPHICS_REFRESH_DAYS * MS_PER_DAY)
    .toISOString()
    .slice(0, 10)
  const { data, error } = await admin
    .from('ig_audience_snapshots')
    .select('id')
    .eq('client_id', clientId)
    .gte('snapshot_date', cutoff)
    .limit(1)
  if (error) throw new Error(`ig_audience_snapshots lookup failed: ${error.message}`)
  if ((data ?? []).length > 0) return

  const [follower, engaged] = await Promise.all([
    fetchDemographics(accountId, accessToken, 'follower_demographics'),
    fetchDemographics(accountId, accessToken, 'engaged_audience_demographics'),
  ])

  // A both-NULL row is still written: it records "checked, the API had nothing"
  // and spaces the eight-call probe to weekly for under-floor accounts.
  const row: {
    client_id: string
    snapshot_date: string
    follower_demographics: IGDemographics | null
    engaged_audience_demographics: IGDemographics | null
  } = {
    client_id: clientId,
    snapshot_date: new Date().toISOString().slice(0, 10),
    follower_demographics: follower,
    engaged_audience_demographics: engaged,
  }
  const { error: upsertError } = await admin
    .from('ig_audience_snapshots')
    .upsert(row, { onConflict: 'client_id,snapshot_date' })
  if (upsertError) throw new Error(`ig_audience_snapshots upsert failed: ${upsertError.message}`)
}

/** Tell the agency the metrics sync is blocked on a dead or underscoped connection. */
async function notifyMetricsBlocked(admin: SupabaseClient, clientId: string): Promise<void> {
  const { data: client, error } = await admin
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .maybeSingle()
  if (error) throw new Error(`client lookup failed: ${error.message}`)
  if (!client) return
  // WHY as: explicit column projection over the untyped admin handle (see header).
  const { name } = client as { name: string }
  await insertClientNotificationOnce(
    admin,
    clientId,
    `Instagram metrics for ${name} could not be synced — please reconnect the account`
  )
}

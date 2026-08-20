import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
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
/**
 * Meta keeps consolidating a day's numbers after it ends (late-counted views,
 * spam removal). Each night the sync re-captures this many finished days, so
 * every stored day converges to Instagram's own value during the week it
 * matters — the cure for "our July 28th disagrees with the IG app".
 */
const CONSOLIDATION_DAYS = 7

type IGAccountMetricsInsert = Database['public']['Tables']['ig_account_metrics']['Insert']
type IGPostMetricsInsert = Database['public']['Tables']['ig_post_metrics']['Insert']

/**
 * Insert shape plus the totals_synced_at marker (migration 20260824) and the
 * account stamp (20260826). WHY extension: the generated types predate the
 * migrations — regenerate database.ts after they apply and fold these back
 * into the Insert type.
 */
export type IGAccountMetricsWriteRow = IGAccountMetricsInsert & {
  totals_synced_at?: string | null
  ig_account_id?: string
}

/** Same transitional shape for post rows: the 20260826 account stamp. */
type IGPostMetricsWriteRow = IGPostMetricsInsert & { ig_account_id?: string }

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
  // WHY as: the shared SupabaseClient param is untyped, so the projection does not infer.
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
  // Scoped to THIS account: after a reconnect the new account has no history
  // and must get its own backfill, whatever the old account left behind.
  const hadHistory = await hasAccountHistory(admin, clientId, accountId)
  await syncAccountDay(admin, clientId, accountId, accessToken)
  if (!hadHistory) await backfillAccountHistory(admin, clientId, accountId, accessToken)
  if (hadHistory) await recaptureConsolidatingDays(admin, clientId, accountId, accessToken)
  await syncPostMetrics(admin, clientId, accountId, accessToken)
  await syncDemographicsWeekly(admin, clientId, accountId, accessToken)
}

/**
 * One finished day's full capture — the five calls the probe verified: the
 * totals pair plus the three rendered breakdowns. Shared by the nightly sync
 * (yesterday + the consolidation window) and the analytics window refill.
 */
export async function captureDayTotals(
  clientId: string,
  accountId: string,
  accessToken: string,
  dateKey: string
): Promise<IGAccountMetricsWriteRow> {
  const sinceTs = Math.floor(Date.parse(dateKey) / 1000)
  const untilTs = sinceTs + SECONDS_PER_DAY
  const [totals, followsSplit, linkTaps, reachByType] = await Promise.all([
    fetchDayTotals(accountId, accessToken, sinceTs, untilTs),
    fetchFollowsBreakdown(accountId, accessToken, sinceTs, untilTs),
    fetchLinkTaps(accountId, accessToken, sinceTs, untilTs),
    fetchReachByProductType(accountId, accessToken, sinceTs, untilTs),
  ])
  return {
    client_id: clientId,
    ig_account_id: accountId,
    metric_date: dateKey,
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
    link_taps_by_button_type: linkTaps.byButton,
    reach_by_media_product_type: reachByType,
    fetched_at: new Date().toISOString(),
    // Asked, whatever came back — the refill never re-spends on this day.
    totals_synced_at: new Date().toISOString(),
  }
}

/** Re-captures days 2..N back so stored values track Meta's consolidation. */
async function recaptureConsolidatingDays(
  admin: SupabaseClient,
  clientId: string,
  accountId: string,
  accessToken: string
): Promise<void> {
  const { date: yesterday } = yesterdayUtcWindow()
  const rows: IGAccountMetricsWriteRow[] = []
  for (let daysBack = 1; daysBack < CONSOLIDATION_DAYS; daysBack++) {
    const dateKey = new Date(Date.parse(yesterday) - daysBack * SECONDS_PER_DAY * 1000)
      .toISOString()
      .slice(0, 10)
    rows.push(await captureDayTotals(clientId, accountId, accessToken, dateKey))
  }
  const { error } = await admin
    .from('ig_account_metrics')
    .upsert(rows, { onConflict: 'client_id,ig_account_id,metric_date' })
  if (error) throw new Error(`consolidation recapture upsert failed: ${error.message}`)
}

async function hasAccountHistory(
  admin: SupabaseClient,
  clientId: string,
  accountId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from('ig_account_metrics')
    .select('id')
    .eq('client_id', clientId)
    .eq('ig_account_id', accountId)
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

  const row: IGAccountMetricsWriteRow = {
    client_id: clientId,
    ig_account_id: accountId,
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
    // The day's totals were asked, whatever came back — the refill marker.
    totals_synced_at: new Date().toISOString(),
  }
  const { error } = await admin
    .from('ig_account_metrics')
    .upsert(row, { onConflict: 'client_id,ig_account_id,metric_date' })
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
  const byDate = new Map<string, IGAccountMetricsWriteRow>()
  const rowFor = (date: string): IGAccountMetricsWriteRow => {
    let row = byDate.get(date)
    if (!row) {
      row = {
        client_id: clientId,
        ig_account_id: accountId,
        metric_date: date,
        reach: null,
        follows: null,
      }
      byDate.set(date, row)
    }
    return row
  }
  for (const day of reachSeries) rowFor(day.date).reach = day.reach
  for (const day of deltaSeries) rowFor(day.date).follows = day.delta
  byDate.delete(window.date)
  if (byDate.size === 0) return

  const { error } = await admin.from('ig_account_metrics').upsert([...byDate.values()], {
    onConflict: 'client_id,ig_account_id,metric_date',
    ignoreDuplicates: true,
  })
  if (error) throw new Error(`ig_account_metrics backfill failed: ${error.message}`)
}

/**
 * Refreshes lifetime insights for media since `sinceIso` (the nightly default
 * is 30 days; the analytics window refresh passes the selected period's start)
 * and links them to Postflow posts.
 */
export async function syncPostMetrics(
  admin: SupabaseClient,
  clientId: string,
  accountId: string,
  accessToken: string,
  sinceIso: string = new Date(Date.now() - MEDIA_LOOKBACK_DAYS * MS_PER_DAY).toISOString()
): Promise<void> {
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
  const rows: IGPostMetricsWriteRow[] = media.map((item, index) => {
    const insights = insightsList[index]!
    return {
      client_id: clientId,
      ig_account_id: accountId,
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
    .upsert(rows, { onConflict: 'client_id,ig_account_id,ig_media_id' })
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
  // WHY as: the shared SupabaseClient param is untyped, so the projection does not infer.
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
    // Account-scoped: a freshly connected account earns its own first snapshot
    // regardless of what the previous account's cadence left behind.
    .eq('ig_account_id', accountId)
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
    ig_account_id: string
    snapshot_date: string
    follower_demographics: IGDemographics | null
    engaged_audience_demographics: IGDemographics | null
  } = {
    client_id: clientId,
    ig_account_id: accountId,
    snapshot_date: new Date().toISOString().slice(0, 10),
    follower_demographics: follower,
    engaged_audience_demographics: engaged,
  }
  const { error: upsertError } = await admin
    .from('ig_audience_snapshots')
    .upsert(row, { onConflict: 'client_id,ig_account_id,snapshot_date' })
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
  // WHY as: the shared SupabaseClient param is untyped, so the projection does not infer.
  const { name } = client as { name: string }
  await insertClientNotificationOnce(
    admin,
    clientId,
    `Instagram metrics for ${name} could not be synced — please reconnect the account`
  )
}

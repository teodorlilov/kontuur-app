import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createSemaphore } from '@/lib/concurrency'
import { GraphApiError } from '@/lib/meta/graph-errors'
import {
  fetchDailyReachSeries,
  fetchDayTotals,
  fetchFollowerDeltaSeries,
  fetchFollowsBreakdown,
  fetchLinkTaps,
  fetchReachByProductType,
} from '@/lib/meta/insights'
import { syncPostMetrics } from './sync-metrics'
import { shiftDateKey } from '@/utils/date-helpers'
import type { AnalyticsPeriod } from './period'

/**
 * The on-demand refill behind "Regenerate": pulls the SELECTED window from
 * Instagram again instead of waiting for tonight's sync. The nightly capture
 * only ever writes yesterday, so history from before the account was
 * connected has day totals (views, likes, …) sitting NULL — the API can serve
 * them, one day per call, and this module asks, newest day first, under a
 * hard call budget so a click can never spend the Meta quota.
 */

/**
 * A refilled day costs five Graph calls (totals pair + three breakdowns), so
 * 40 days ≈ 200 calls — a big but quota-safe click. Older days than the cap
 * fill on the next click: already-refilled days are skipped, so repeated
 * clicks walk backwards through history instead of re-spending the budget.
 */
const REFILL_DAYS_CAP = 40
/** Insights time ranges cap at 30 days per request — series calls are chunked. */
const SERIES_CHUNK_DAYS = 30
const REFILL_CONCURRENCY = 3
const SECONDS_PER_DAY = 86_400

type IGAccountMetricsInsert = Database['public']['Tables']['ig_account_metrics']['Insert']

export interface RefreshOutcome {
  /** Days whose totals were (re)written this run. */
  refilledDays: number
  /** Meta throttled mid-run — what landed stays, the rest waits. */
  rateLimited: boolean
}

/**
 * Which days deserve a totals call: inside either window, not today (still
 * accruing), and either missing entirely or captured without day totals.
 * Newest first — the current period fills before deep history.
 */
export function selectRefillDays(
  rows: Array<{ metric_date: string; views: number | null }>,
  period: AnalyticsPeriod,
  todayKey: string,
  cap: number = REFILL_DAYS_CAP
): string[] {
  const viewsByDate = new Map(rows.map((row) => [row.metric_date, row.views]))
  const targets: string[] = []
  for (let key = period.end; key >= period.prevStart; key = shiftDateKey(key, -1)) {
    if (key >= todayKey) continue
    const views = viewsByDate.get(key)
    if (views === undefined || views === null) targets.push(key)
  }
  return targets.slice(0, cap)
}

/** UTC [start, end] inclusive day keys → ≤30-day unix-second windows. */
function seriesChunks(start: string, end: string): Array<{ sinceTs: number; untilTs: number }> {
  const chunks: Array<{ sinceTs: number; untilTs: number }> = []
  let cursor = start
  while (cursor <= end) {
    const chunkEnd = shiftDateKey(cursor, SERIES_CHUNK_DAYS - 1)
    const clampedEnd = chunkEnd < end ? chunkEnd : end
    chunks.push({
      sinceTs: Math.floor(Date.parse(cursor) / 1000),
      untilTs: Math.floor(Date.parse(shiftDateKey(clampedEnd, 1)) / 1000),
    })
    cursor = shiftDateKey(clampedEnd, 1)
  }
  return chunks
}

function dayBounds(dateKey: string): { sinceTs: number; untilTs: number } {
  const sinceTs = Math.floor(Date.parse(dateKey) / 1000)
  return { sinceTs, untilTs: sinceTs + SECONDS_PER_DAY }
}

async function upsertColumnBatch(
  admin: SupabaseClient,
  rows: IGAccountMetricsInsert[]
): Promise<void> {
  if (rows.length === 0) return
  const { error } = await admin
    .from('ig_account_metrics')
    .upsert(rows, { onConflict: 'client_id,metric_date' })
  if (error) throw new Error(`window refresh upsert failed: ${error.message}`)
}

/**
 * Refreshes both windows of the period from the Graph API: the two cheap
 * series (reach, follower deltas) across the whole span, day totals for the
 * capped target days, and the period's post metrics. Writes are per-column
 * batches so a refreshed value never nulls out a column another pass owns.
 * A rate limit stops the run and reports it; everything already written stays.
 */
export async function refreshWindowMetrics(
  admin: SupabaseClient,
  connection: { clientId: string; accountId: string; accessToken: string },
  period: AnalyticsPeriod,
  todayKey: string
): Promise<RefreshOutcome> {
  const { clientId, accountId, accessToken } = connection
  const spanEnd = period.end < todayKey ? period.end : shiftDateKey(todayKey, -1)

  const { data, error } = await admin
    .from('ig_account_metrics')
    .select('metric_date, views')
    .eq('client_id', clientId)
    .gte('metric_date', period.prevStart)
    .lte('metric_date', period.end)
  if (error) throw new Error(`window refresh read failed: ${error.message}`)
  // WHY as: the shared admin client is untyped, so the projection does not infer.
  const existing = (data ?? []) as Array<{ metric_date: string; views: number | null }>
  const targets = selectRefillDays(existing, period, todayKey)

  let rateLimited = false
  let refilledDays = 0

  // The two series the API still serves for the past — chunked, both windows.
  const reachRows: IGAccountMetricsInsert[] = []
  const followRows: IGAccountMetricsInsert[] = []
  try {
    for (const chunk of seriesChunks(period.prevStart, spanEnd)) {
      const [reach, deltas] = await Promise.all([
        fetchDailyReachSeries(accountId, accessToken, chunk.sinceTs, chunk.untilTs),
        fetchFollowerDeltaSeries(accountId, accessToken, chunk.sinceTs, chunk.untilTs),
      ])
      for (const day of reach) {
        if (day.date <= spanEnd) {
          reachRows.push({ client_id: clientId, metric_date: day.date, reach: day.reach })
        }
      }
      for (const day of deltas) {
        if (day.date <= spanEnd) {
          followRows.push({ client_id: clientId, metric_date: day.date, follows: day.delta })
        }
      }
    }
  } catch (err) {
    if (err instanceof GraphApiError && err.failure === 'rate_limited') rateLimited = true
    else throw err
  }
  await upsertColumnBatch(admin, reachRows)
  await upsertColumnBatch(admin, followRows)

  // Day totals, newest first, under the call budget.
  if (!rateLimited && targets.length > 0) {
    const semaphore = createSemaphore(REFILL_CONCURRENCY)
    const totalsRows: IGAccountMetricsInsert[] = []
    await Promise.all(
      targets.map(async (dateKey) => {
        const release = await semaphore.acquire()
        try {
          if (rateLimited) return
          const bounds = dayBounds(dateKey)
          // Everything the nightly sync captures per day, so every section the
          // period filter drives refills — not just the headline totals.
          // (interactions_by_media_product_type is skipped: nothing renders it.)
          const [totals, followsSplit, linkTaps, reachByType] = await Promise.all([
            fetchDayTotals(accountId, accessToken, bounds.sinceTs, bounds.untilTs),
            fetchFollowsBreakdown(accountId, accessToken, bounds.sinceTs, bounds.untilTs),
            fetchLinkTaps(accountId, accessToken, bounds.sinceTs, bounds.untilTs),
            fetchReachByProductType(accountId, accessToken, bounds.sinceTs, bounds.untilTs),
          ])
          totalsRows.push({
            client_id: clientId,
            metric_date: dateKey,
            views: totals.views,
            total_interactions: totals.total_interactions,
            likes: totals.likes,
            comments: totals.comments,
            saves: totals.saves,
            shares: totals.shares,
            replies: totals.replies,
            reposts: totals.reposts,
            profile_views: totals.profile_views,
            website_clicks: totals.website_clicks,
            accounts_engaged: totals.accounts_engaged,
            follows: followsSplit.follows,
            unfollows: followsSplit.unfollows,
            profile_links_taps: linkTaps.total,
            link_taps_by_button_type: linkTaps.byButton,
            reach_by_media_product_type: reachByType,
            fetched_at: new Date().toISOString(),
          })
        } catch (err) {
          if (err instanceof GraphApiError && err.failure === 'rate_limited') rateLimited = true
          else throw err
        } finally {
          release()
        }
      })
    )
    await upsertColumnBatch(admin, totalsRows)
    refilledDays = totalsRows.length
  }

  // The period's posts re-sync too — reach/saves/follows on rows the table shows.
  if (!rateLimited) {
    try {
      await syncPostMetrics(admin, clientId, accountId, accessToken, `${period.start}T00:00:00Z`)
    } catch (err) {
      if (err instanceof GraphApiError && err.failure === 'rate_limited') rateLimited = true
      else throw err
    }
  }

  return { refilledDays, rateLimited }
}

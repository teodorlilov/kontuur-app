import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createSemaphore } from '@/lib/concurrency'
import { GraphApiError } from '@/lib/meta/graph-errors'
import { captureOnlineFollowers } from './online-followers'
import { fetchDailyReachSeries } from '@/lib/meta/instagram/insights'
import { captureDayTotals, syncDemographicsWeekly, syncPostMetrics } from './sync-metrics'
import { dayKeyToUnixSeconds, shiftDateKey } from '@/utils/date-helpers'
import { dayChunks, type AnalyticsPeriod } from '../compute/period'
import {
  igMarkers,
  readMarkerRows,
  REFRESH_TAIL_DAYS,
  type MarkerRow,
} from '../shared/unfilled-days'
import {
  toReachRows,
  upsertAccountMetricDays,
  type IGAccountMetricsInsert,
} from './account-metrics-store'

/**
 * The on-demand refill behind the auto-fill (`fillPeriodData` → `AutoFill`):
 * pulls the SELECTED window from Instagram again instead of waiting for
 * tonight's sync. The nightly capture writes yesterday and the consolidation
 * tail, and a first sync's backfill seeds reach alone, so history from before
 * the account was connected has its day totals (views, likes, …) sitting NULL
 * — the API can serve them, one day per call, and this module asks, newest day
 * first, under a hard call budget so opening a window can never spend the
 * Meta quota.
 */

/**
 * A refilled day costs six Graph calls: `captureDayTotals` is the totals pair
 * plus four breakdowns. 62 days covers the DEFAULT 30-day view's two windows
 * in one run; deeper windows chain, the auto-fill re-firing while the unfilled
 * count keeps dropping.
 */
const REFILL_DAYS_CAP = 62
/** Insights time ranges cap at 30 days per request — series calls are chunked. */
const SERIES_CHUNK_DAYS = 30
const REFILL_CONCURRENCY = 3

interface RefreshOutcome {
  /** Days whose totals were (re)written this run. */
  refilledDays: number
  /** Meta throttled mid-run — what landed stays, the rest waits. */
  rateLimited: boolean
  /** Days whose capture failed for some other reason. */
  failedDays: number
}

/**
 * Which days deserve a totals call: inside either window, not today (still
 * accruing), and either never asked of Meta (no row, or no totals_synced_at
 * marker) or inside the recent tail that re-asks for consolidation. Newest
 * first — the current period fills before deep history. Past that tail a
 * marked day is never asked again, which is what lets the auto-fill chain
 * terminate: "asked, and Meta had nothing" is an answer, not a gap.
 */
export function selectRefillDays(
  rows: MarkerRow[],
  period: AnalyticsPeriod,
  todayKey: string,
  cap: number = REFILL_DAYS_CAP
): string[] {
  const markerByDate = new Map(rows.map((row) => [row.metric_date, row.totals_synced_at]))
  const tailStart = shiftDateKey(todayKey, -REFRESH_TAIL_DAYS)
  const targets: string[] = []
  for (let key = period.end; key >= period.prevStart; key = shiftDateKey(key, -1)) {
    if (key >= todayKey) continue
    const marker = markerByDate.get(key)
    const neverAsked = marker === undefined || marker === null
    if (neverAsked || key >= tailStart) targets.push(key)
  }
  return targets.slice(0, cap)
}

/**
 * UTC [start, end] inclusive day keys → ≤30-day unix-second windows.
 *
 * Each chunk's `until` lands one day PAST its last day. Meta's handling of that bound is loose
 * — the series can also return a bucket outside the asked span, which is why callers filter
 * results back to the window — so the shift is what keeps a chunk's final day.
 */
function seriesChunks(start: string, end: string): Array<{ sinceTs: number; untilTs: number }> {
  return dayChunks(start, end, SERIES_CHUNK_DAYS).map((chunk) => ({
    sinceTs: dayKeyToUnixSeconds(chunk.start),
    untilTs: dayKeyToUnixSeconds(shiftDateKey(chunk.end, 1)),
  }))
}

/**
 * Refreshes both windows of the period from the Graph API: the two ranged
 * series (daily reach, hourly follower-online maps) across the whole span, day
 * totals for the capped target days, and the period's post metrics. Writes are
 * per-column batches so a refreshed value never nulls out a column another pass
 * owns. A rate limit stops the run and reports it; what landed stays.
 *
 * A day whose capture fails for any other reason is COUNTED, never rethrown: a rejection inside
 * the day loop would take the whole `Promise.all` with it and skip the upsert that follows,
 * discarding every day already fetched because one failed.
 *
 * Two further passes run here rather than waiting for the nightly cron: the posting times derived
 * from the hours just stored, and the demographics snapshot the audience panel needs, that panel
 * being the one section no day row can produce. Both are best-effort — neither may cost the
 * refill its day totals.
 */
export async function refreshWindowMetrics(
  admin: SupabaseClient,
  connection: { clientId: string; accountId: string; accessToken: string },
  period: AnalyticsPeriod,
  todayKey: string
): Promise<RefreshOutcome> {
  const { clientId, accountId, accessToken } = connection
  const spanEnd = period.end < todayKey ? period.end : shiftDateKey(todayKey, -1)

  const existing = await readMarkerRows(admin, igMarkers(clientId, accountId), period)
  const targets = selectRefillDays(existing, period, todayKey)

  let rateLimited = false
  let refilledDays = 0
  let failedDays = 0

  const reachRows: IGAccountMetricsInsert[] = []
  try {
    for (const chunk of seriesChunks(period.prevStart, spanEnd)) {
      const [reach] = await Promise.all([
        fetchDailyReachSeries(accountId, accessToken, chunk.sinceTs, chunk.untilTs),
        captureOnlineFollowers(
          admin,
          { clientId, accountId, accessToken },
          { sinceTs: chunk.sinceTs, untilTs: chunk.untilTs, throughDate: spanEnd }
        ),
      ])
      reachRows.push(...toReachRows(clientId, accountId, reach, spanEnd))
    }
  } catch (err) {
    if (err instanceof GraphApiError && err.failure === 'rate_limited') rateLimited = true
    else throw err
  }
  await upsertAccountMetricDays(admin, reachRows, 'window refresh reach')

  if (!rateLimited && targets.length > 0) {
    const semaphore = createSemaphore(REFILL_CONCURRENCY)
    const totalsRows: IGAccountMetricsInsert[] = []
    await Promise.all(
      targets.map(async (dateKey) => {
        const release = await semaphore.acquire()
        try {
          if (rateLimited) return
          totalsRows.push(await captureDayTotals(clientId, accountId, accessToken, dateKey))
        } catch (err) {
          if (err instanceof GraphApiError && err.failure === 'rate_limited') {
            rateLimited = true
            return
          }
          failedDays++
          console.error(`[analytics] day capture failed for ${dateKey}:`, err)
        } finally {
          release()
        }
      })
    )
    await upsertAccountMetricDays(admin, totalsRows, 'window refresh totals')
    refilledDays = totalsRows.length
  }

  if (!rateLimited) {
    try {
      await syncPostMetrics(admin, clientId, accountId, accessToken, `${period.start}T00:00:00Z`)
    } catch (err) {
      if (err instanceof GraphApiError && err.failure === 'rate_limited') rateLimited = true
      else throw err
    }
  }

  if (!rateLimited) {
    try {
      await syncDemographicsWeekly(admin, clientId, accountId, accessToken)
    } catch (err) {
      if (err instanceof GraphApiError && err.failure === 'rate_limited') rateLimited = true
      else console.error('[analytics] demographics refill failed:', err)
    }
  }

  return { refilledDays, rateLimited, failedDays }
}

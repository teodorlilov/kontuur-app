import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createSemaphore } from '@/lib/concurrency'
import { GraphApiError } from '@/lib/meta/graph-errors'
import { captureOnlineFollowers, refreshObservedBestTime } from './online-followers'
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
 * The on-demand refill behind "Regenerate": pulls the SELECTED window from
 * Instagram again instead of waiting for tonight's sync. The nightly capture
 * only ever writes yesterday, so history from before the account was
 * connected has day totals (views, likes, …) sitting NULL — the API can serve
 * them, one day per call, and this module asks, newest day first, under a
 * hard call budget so a click can never spend the Meta quota.
 */

/**
 * A refilled day costs six Graph calls (totals pair + four breakdowns).
 * 62 days covers the DEFAULT 30-day view's two windows in one run; deeper
 * windows chain runs (the auto-fill re-fires while the unfilled count keeps
 * dropping). Marked days are always skipped, so a run only ever spends budget
 * on history it has never asked for.
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
 * first — the current period fills before deep history. "Asked but Meta had
 * nothing" days carry a marker and are never re-spent on.
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

/** UTC [start, end] inclusive day keys → ≤30-day unix-second windows. */
function seriesChunks(start: string, end: string): Array<{ sinceTs: number; untilTs: number }> {
  return dayChunks(start, end, SERIES_CHUNK_DAYS).map((chunk) => ({
    sinceTs: dayKeyToUnixSeconds(chunk.start),
    // `until` is exclusive-ish at Meta's end; one day past the chunk's last day covers it.
    untilTs: dayKeyToUnixSeconds(shiftDateKey(chunk.end, 1)),
  }))
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

  const existing = await readMarkerRows(admin, igMarkers(clientId, accountId), period)
  const targets = selectRefillDays(existing, period, todayKey)

  let rateLimited = false
  let refilledDays = 0
  let failedDays = 0

  // The series the API still serves for the past — chunked, both windows.
  const reachRows: IGAccountMetricsInsert[] = []
  try {
    for (const chunk of seriesChunks(period.prevStart, spanEnd)) {
      const [reach] = await Promise.all([
        fetchDailyReachSeries(accountId, accessToken, chunk.sinceTs, chunk.untilTs),
        // Through the shared capture, which stores as it goes. This branch used to fetch and map
        // the same column itself, in parallel with the nightly sync doing the same over a different
        // window — two writers of one column, and only the other one derived anything from it.
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
  // The hours this refill just stored may be exactly what was blocking this client's posting
  // times — before, they were written here and derived only by the nightly cron, so refreshing
  // analytics filled the gap and left the answer stale until the morning.
  //
  // Best-effort on purpose, like the capture it follows: posting times are an enhancement and
  // must never cost the refill its day totals.
  try {
    await refreshObservedBestTime(admin, clientId)
  } catch (err) {
    console.error('[analytics] best-time refresh after refill failed:', err)
  }

  // Day totals, newest first, under the call budget.
  if (!rateLimited && targets.length > 0) {
    const semaphore = createSemaphore(REFILL_CONCURRENCY)
    const totalsRows: IGAccountMetricsInsert[] = []
    await Promise.all(
      targets.map(async (dateKey) => {
        const release = await semaphore.acquire()
        try {
          if (rateLimited) return
          // The same full-day capture the nightly sync writes, so every
          // section the period filter drives refills — not just headline totals.
          totalsRows.push(await captureDayTotals(clientId, accountId, accessToken, dateKey))
        } catch (err) {
          if (err instanceof GraphApiError && err.failure === 'rate_limited') {
            rateLimited = true
            return
          }
          // Counted, not thrown. Rejecting here took the whole Promise.all with
          // it, so the upsert below never ran and up to 61 days that HAD been
          // fetched were discarded because the sixty-second failed.
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

  // The period's posts re-sync too — reach/saves/follows on rows the table shows.
  if (!rateLimited) {
    try {
      await syncPostMetrics(admin, clientId, accountId, accessToken, `${period.start}T00:00:00Z`)
    } catch (err) {
      if (err instanceof GraphApiError && err.failure === 'rate_limited') rateLimited = true
      else throw err
    }
  }

  // "Who follows, who engages" is the one section no day row can produce: it
  // needs a demographics snapshot, and until now ONLY the nightly cron wrote
  // one — so every filter could refill the whole document and still leave the
  // audience panel saying no snapshot exists. The call is cadence-gated inside
  // (a snapshot within the week makes it a single cheap lookup) and
  // best-effort: eight breakdown calls must never cost the refill its totals.
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

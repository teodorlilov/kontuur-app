import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchOnlineFollowers } from '@/lib/meta/instagram/insights'
import { asJson } from '@/lib/queries/as-json'
import { SECONDS_PER_DAY } from '@/utils/constants'
import { deriveObservedBestTime } from './derive-best-time'
import { upsertAccountMetricDays, type IGAccountMetricsInsert } from './account-metrics-store'

/**
 * Hourly follower-online data: the one way it is fetched, stored, and turned into posting times.
 *
 * Fetch-and-store lives here rather than in each caller because three paths write the column over
 * different windows — the nightly sync, the OAuth callback and the analytics window refill — and
 * only a shared entry point keeps a capture from landing without the derivation that reads it.
 */

/** Matches `OBSERVED_LOOKBACK_DAYS`, the window the derivation actually reads back. */
export const ONLINE_FOLLOWERS_BACKFILL_DAYS = 28

/** A connected account, as every function here needs it. */
interface OnlineFollowersTarget {
  clientId: string
  accountId: string
  accessToken: string
}

/**
 * Fetch one window of hourly maps and store it. Returns how many days were written.
 *
 * `throughDate` exists because the two callers disagree about the newest day, not because either is
 * wrong: the analytics refill knows its period's end and must not store a day past it, while the
 * nightly sync has no such edge. Empty maps never arrive — `fetchOnlineFollowers` drops them,
 * because an empty map is the Graph API being silent rather than a day with nobody online.
 */
export async function captureOnlineFollowers(
  admin: SupabaseClient,
  target: OnlineFollowersTarget,
  window: { sinceTs: number; untilTs: number; throughDate?: string }
): Promise<number> {
  const days = await fetchOnlineFollowers(
    target.accountId,
    target.accessToken,
    window.sinceTs,
    window.untilTs
  )
  const rows: IGAccountMetricsInsert[] = days
    .filter((day) => !window.throughDate || day.date <= window.throughDate)
    .map((day) => ({
      client_id: target.clientId,
      ig_account_id: target.accountId,
      metric_date: day.date,
      online_followers_by_hour: day.byHour,
    }))
  if (rows.length === 0) return 0

  await upsertAccountMetricDays(admin, rows, 'online followers')
  return rows.length
}

/** The window a backfill asks for: `days` back from now. Internal — every caller goes through
 *  `captureAndDeriveBestTime`, which is the pairing that must not come apart. */
function backfillWindow(days = ONLINE_FOLLOWERS_BACKFILL_DAYS): {
  sinceTs: number
  untilTs: number
} {
  const untilTs = Math.floor(Date.now() / 1000)
  return { sinceTs: untilTs - days * SECONDS_PER_DAY, untilTs }
}

/**
 * Re-derive this client's posting times from whatever is stored, and write the result.
 *
 * Called after ANY capture, so input and output are never out of step.
 *
 * Writes only on success. A client who drops below the evidence floor — a reconnect to a different
 * account, say — keeps their last measured times rather than having them silently blanked, and the
 * stamp says when they were measured.
 */
export async function refreshObservedBestTime(
  admin: SupabaseClient,
  clientId: string
): Promise<boolean> {
  const observed = await deriveObservedBestTime(admin, clientId)
  if (!observed) return false

  const { error } = await admin
    .from('brand_profiles')
    .update({
      best_time_json: asJson(observed),
      best_time_updated_at: new Date().toISOString(),
    })
    .eq('client_id', clientId)
  if (error) throw new Error(`observed best-time write failed: ${error.message}`)
  return true
}

/**
 * Capture and derive in one call — what every caller outside the analytics refill wants.
 *
 * The nightly sync and the OAuth callback both mean the same thing: get the hours, then work out
 * the times. Keeping them paired is what stops a caller appearing that does the first half only and
 * leaves the stored times stale.
 */
export async function captureAndDeriveBestTime(
  admin: SupabaseClient,
  target: OnlineFollowersTarget,
  days?: number
): Promise<boolean> {
  await captureOnlineFollowers(admin, target, backfillWindow(days))
  return refreshObservedBestTime(admin, target.clientId)
}

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { fetchOnlineFollowers } from '@/lib/meta/insights'
import { asJson } from '@/lib/queries/as-json'
import { SECONDS_PER_DAY } from '@/utils/constants'
import { deriveObservedBestTime } from './derive-best-time'

type IGAccountMetricsInsert = Database['public']['Tables']['ig_account_metrics']['Insert']

/**
 * Hourly follower-online data: the one way it is fetched, stored, and turned into posting times.
 *
 * There were two of each. `syncOnlineFollowers` in the nightly sync asked Meta for four days and
 * upserted them; the online branch of `refreshWindowMetrics` asked for up to ninety, chunked, and
 * upserted the same column on the same conflict key. Two fetch-and-store paths for one column, with
 * different windows — and only the nightly one went on to derive anything, so a user could refresh
 * their analytics, fill the exact gap blocking their posting times, and still wait for the cron.
 *
 * That split also set the product's behaviour by accident. Nothing backfilled this column, so a
 * newly connected account gained one day per night and the derivation answered as soon as it had
 * five — a weekday-by-hour grid where most cells held a single observation. The ninety-day capability
 * existed the whole time, in the caller that never derived.
 */

/** How far back a capture reaches when it has no better instruction — see `MIN_BEST_TIME_DAYS`. */
export const ONLINE_FOLLOWERS_BACKFILL_DAYS = 28

/** A connected account, as every function here needs it. */
export interface OnlineFollowersTarget {
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

  const { error } = await admin
    .from('ig_account_metrics')
    .upsert(rows, { onConflict: 'client_id,ig_account_id,metric_date' })
  if (error) throw new Error(`online_followers upsert failed: ${error.message}`)
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
 * Called after ANY capture, so the two are never out of step. It used to live inline in the nightly
 * sync's "online hours" phase, which is why the analytics refill could write the input and leave the
 * output stale.
 *
 * Writes only on success. A client who drops below the threshold — a reconnect to a different
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
 * Capture and derive in one call — what every caller outside the analytics refill actually wants.
 *
 * The nightly sync, a fresh connection and a reconnect all mean the same thing: get the hours, then
 * work out the times. Keeping them together is what stops a fourth caller appearing that does the
 * first half only, which is the defect this module was built to remove.
 */
export async function captureAndDeriveBestTime(
  admin: SupabaseClient,
  target: OnlineFollowersTarget,
  days?: number
): Promise<boolean> {
  await captureOnlineFollowers(admin, target, backfillWindow(days))
  return refreshObservedBestTime(admin, target.clientId)
}

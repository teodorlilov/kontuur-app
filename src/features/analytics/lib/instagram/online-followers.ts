import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchOnlineFollowers } from '@/lib/meta/instagram/insights'
import { SECONDS_PER_DAY } from '@/utils/constants'
import { upsertAccountMetricDays, type IGAccountMetricsInsert } from './account-metrics-store'

/**
 * Hourly follower-online data: the one way it is fetched and stored.
 *
 * Fetch-and-store lives here rather than in each caller because three paths write the column over
 * different windows — the nightly sync, the OAuth callback and the analytics window refill.
 *
 * These counts are the input to the analytics report's observed weekday x hour grid, and to
 * nothing else. They used to also feed a stored "best time to post" recommendation; that was
 * removed on 2026-09-08 (migration 20260848) because only the hour axis of it was measurable.
 */

/** Four weeks: enough for the report's grid to see every weekday several times, recent enough
 *  that a growing audience's habits have not moved underneath it. */
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

/** The window a backfill asks for: `days` back from now. */
function backfillWindow(days = ONLINE_FOLLOWERS_BACKFILL_DAYS): {
  sinceTs: number
  untilTs: number
} {
  const untilTs = Math.floor(Date.now() / 1000)
  return { sinceTs: untilTs - days * SECONDS_PER_DAY, untilTs }
}

/**
 * Capture a trailing window of hourly maps for a newly connected or nightly-synced account.
 *
 * The nightly sync and the OAuth callback both want the same thing — the last few weeks of
 * follower-online counts, with no period edge to respect — so they share this rather than each
 * building a window. The analytics refill calls `captureOnlineFollowers` directly, because it has
 * a period end its rows must not pass.
 */
export async function backfillOnlineFollowers(
  admin: SupabaseClient,
  target: OnlineFollowersTarget,
  days?: number
): Promise<number> {
  return captureOnlineFollowers(admin, target, backfillWindow(days))
}

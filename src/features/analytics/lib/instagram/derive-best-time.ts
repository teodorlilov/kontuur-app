import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BestTimePlatform } from '@/lib/suggested-times/schemas'
import { fetchIgConnectionState } from '@/lib/queries/db'
import { PLATFORM_NAMES } from '@/lib/validation'
import { MIN_BEST_TIME_DAYS, MS_PER_DAY, WEEKDAY_LABELS } from '@/utils/constants'
import { buildAudienceOnline, type AudienceOnline } from './build-report'

/**
 * Posting times read off the observed weekday × hour grid of follower-online counts.
 *
 * This is the ONLY thing that produces `brand_profiles.best_time_json` (written by
 * `refreshObservedBestTime`), which is why it returns null rather than a thin answer whenever the
 * evidence is short: `slot-picker.ts` records that a second, model-written source of the same
 * column was deleted rather than narrowed, because nothing downstream could tell a measurement
 * from an invention.
 */

/**
 * How much history the recommendation reads. Twenty-eight days, deliberately not ninety: an
 * audience's habits move as it grows, and a quarter-long average smears a changing pattern into a
 * flat one. Four weeks is enough to see every weekday four times and recent enough to still be true.
 */
const OBSERVED_LOOKBACK_DAYS = 28

interface ObservedBestTime {
  platforms: BestTimePlatform[]
  upgrade_note: string
}

/** Pure — grid in, recommendation out, which is what lets `derive-best-time.test.ts` drive it. */
export function bestTimeFromOnline(online: AudienceOnline): ObservedBestTime {
  const bestDays = online.grid
    .map((row, weekday) => ({ weekday, score: Math.max(...row) }))
    .filter((day) => day.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((day) => WEEKDAY_LABELS[day.weekday]!)
  const windows = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    mean: online.grid.reduce((sum, row) => sum + row[hour]!, 0) / 7,
  }))
    .filter((entry) => entry.mean > 0)
    .sort((a, b) => b.mean - a.mean)
    .slice(0, 3)
    .map((entry) => ({
      time: `${String(entry.hour).padStart(2, '0')}:00`,
      label: 'Followers online peak',
      reason: `about ${Math.round(entry.mean)} followers online at this hour, on average`,
    }))
  return {
    platforms: [
      {
        platform: PLATFORM_NAMES.instagram,
        best_days: bestDays,
        best_time_windows: windows,
        confidence: 'observed',
        reasoning_summary: `Derived from ${PLATFORM_NAMES.instagram}'s hourly follower-online counts, averaged over ${online.sampleDays} days in your timezone — measured activity, not a profile-based estimate.`,
      },
    ],
    upgrade_note: 'Refreshed nightly from observed follower activity.',
  }
}

/**
 * Reads the last 28 days of hourly maps for the client's CURRENT account.
 *
 * Two refusals are load-bearing, both pinned by `best-time-floor.test.ts`. A FAILED timezone read
 * abandons the derivation rather than falling through to the default: this timezone buckets every
 * hourly map into the weekday × hour grid, so defaulting on a transient failure rotates the whole
 * recommendation — a wrong answer shaped exactly like a right one, written to `best_time_json` and
 * published against. An ABSENT timezone is still UTC: that is a real answer about a client whose
 * agency set none. And below `MIN_BEST_TIME_DAYS` sampled days the grid is a handful of single
 * observations, where one busy Tuesday reads exactly like a habit.
 *
 * WHY as: PostgREST returns an embedded relation as an object for a one-to-one and an array
 * for a one-to-many, and which it is depends on the FK's cardinality inference — so the union
 * here has two real arms and dropping either compiles but breaks at runtime.
 */
export async function deriveObservedBestTime(
  db: SupabaseClient,
  clientId: string
): Promise<ObservedBestTime | null> {
  const { accountId } = await fetchIgConnectionState(db, clientId)
  if (!accountId) return null

  const { data: clientRow, error: clientError } = await db
    .from('clients')
    .select('agencies(timezone)')
    .eq('id', clientId)
    .maybeSingle()
  if (clientError) return null
  const agencies = (
    clientRow as {
      agencies: { timezone: string | null } | Array<{ timezone: string | null }> | null
    } | null
  )?.agencies
  const timezone = (Array.isArray(agencies) ? agencies[0]?.timezone : agencies?.timezone) ?? 'UTC'

  const since = new Date(Date.now() - OBSERVED_LOOKBACK_DAYS * MS_PER_DAY)
    .toISOString()
    .slice(0, 10)
  const { data, error } = await db
    .from('ig_account_metrics')
    .select('metric_date, online_followers_by_hour')
    .eq('client_id', clientId)
    .eq('ig_account_id', accountId)
    .gte('metric_date', since)
    .not('online_followers_by_hour', 'is', null)
  if (error) return null
  const online = buildAudienceOnline(
    (data ?? []) as Array<{ metric_date: string; online_followers_by_hour: unknown }>,
    timezone
  )
  if (!online || online.peaks.length === 0) return null
  if (online.sampleDays < MIN_BEST_TIME_DAYS) return null
  return bestTimeFromOnline(online)
}

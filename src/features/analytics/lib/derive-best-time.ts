import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BestTimePlatform } from '@/lib/scheduling/schemas'
import { fetchCurrentIgAccountId } from '@/lib/queries/db'
import { MS_PER_DAY, WEEKDAY_LABELS } from '@/utils/constants'
import { buildAudienceOnline, type AudienceOnline } from './build-report'

/**
 * The observed replacement for the model-invented best_time_json.
 *
 * generateBestTime asks a model to imagine posting times from four profile
 * fields — no Meta data ever touches it, and the calendar's ghost slots treat
 * the output as a stored pattern. Wherever the hourly follower-online history
 * exists, THIS derivation outranks it: days and windows read off the observed
 * weekday × hour grid, confidence says 'observed', and the reasoning names
 * its evidence. Null whenever the evidence is thin — callers fall back
 * rather than fabricate.
 */

const OBSERVED_LOOKBACK_DAYS = 28

export interface ObservedBestTime {
  platforms: BestTimePlatform[]
  upgrade_note: string
}

/** Top weekdays by their busiest hour; top hours by cross-week mean. Pure. */
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
        platform: 'Instagram',
        best_days: bestDays,
        best_time_windows: windows,
        confidence: 'observed',
        reasoning_summary: `Derived from Instagram's hourly follower-online counts, averaged over ${online.sampleDays} days in your timezone — measured activity, not a profile-based estimate.`,
      },
    ],
    upgrade_note: 'Refreshed nightly from observed follower activity.',
  }
}

/** Reads the last 28 days of hourly maps for the client's CURRENT account. */
export async function deriveObservedBestTime(
  db: SupabaseClient,
  clientId: string
): Promise<ObservedBestTime | null> {
  const accountId = await fetchCurrentIgAccountId(db, clientId)
  if (!accountId) return null

  const { data: clientRow } = await db
    .from('clients')
    .select('agencies(timezone)')
    .eq('id', clientId)
    .maybeSingle()
  // WHY as: nested relation shape depends on the FK's cardinality inference.
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
  // Read failed or nothing stored: no observed value — the caller falls
  // back, it never fabricates on our behalf.
  if (error) return null
  const online = buildAudienceOnline(
    (data ?? []) as Array<{ metric_date: string; online_followers_by_hour: unknown }>,
    timezone
  )
  if (!online || online.peaks.length === 0) return null
  return bestTimeFromOnline(online)
}

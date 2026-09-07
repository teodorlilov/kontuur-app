import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types'

/** A day row as any writer of one describes it. */
export type IGAccountMetricsInsert = Database['public']['Tables']['ig_account_metrics']['Insert']

/**
 * The unique key every writer resolves against. Named once because it is what makes per-column
 * batching safe: two passes writing different columns of the same day must land on the same row,
 * and a typo in a spelled-out conflict target does not fail — it silently creates a second row.
 */
const DAY_KEY = 'client_id,ig_account_id,metric_date'

/**
 * Write day rows. The ONE way `ig_account_metrics` is written.
 *
 * `context` names the pass in the thrown message, and is required rather than optional: seven call
 * sites share this function, and the message is the only thing that says which one failed.
 *
 * PER-COLUMN BATCHING IS DELIBERATE. Callers upsert partial rows — reach in one pass, day totals in
 * another, online-follower hours in a third — and an upsert only touches the keys it is given, so a
 * pass never nulls a column another pass owns. Do not "simplify" this into one whole-row write:
 * `recaptureConsolidatingDays` keeps reach out of its totals row because reach is a series metric
 * whose gaps are not zeros, and a shared row shape would force an explicit NULL for every day the
 * series skipped.
 */
export async function upsertAccountMetricDays(
  admin: SupabaseClient,
  rows: IGAccountMetricsInsert[],
  context: string,
  options?: { ignoreDuplicates?: boolean }
): Promise<void> {
  if (rows.length === 0) return
  const { error } = await admin
    .from('ig_account_metrics')
    .upsert(rows, { onConflict: DAY_KEY, ignoreDuplicates: options?.ignoreDuplicates })
  if (error) throw new Error(`${context} upsert failed: ${error.message}`)
}

/**
 * Turn a daily reach series into day rows, dropping anything past `through`.
 *
 * Two callers need exactly this: the nightly consolidation recapture and the analytics window
 * refill. `backfillAccountHistory` builds a near-copy through a Map because it also de-duplicates;
 * forcing it through here would mean passing the Map in.
 */
export function toReachRows(
  clientId: string,
  accountId: string,
  series: readonly { date: string; reach: number }[],
  through?: string
): IGAccountMetricsInsert[] {
  return series
    .filter((day) => !through || day.date <= through)
    .map((day) => ({
      client_id: clientId,
      ig_account_id: accountId,
      metric_date: day.date,
      reach: day.reach,
    }))
}

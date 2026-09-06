import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types'

/** A day row as any writer of one describes it. */
export type IGAccountMetricsInsert = Database['public']['Tables']['ig_account_metrics']['Insert']

/**
 * The unique key every writer resolves against. Named once because it is the thing that makes
 * per-column batching safe: two passes writing different columns of the same day must land on the
 * same row, and a typo here would silently create a second one instead.
 */
const DAY_KEY = 'client_id,ig_account_id,metric_date'

/**
 * Write day rows. The ONE way `ig_account_metrics` is written.
 *
 * There were six, spread across three files, each spelling out the same `onConflict` target and its
 * own error message. They were not disagreeing — but nothing kept them agreeing either, and the
 * table has no test coverage at all, so the first divergence would have surfaced as wrong numbers on
 * a client's analytics page days later rather than as a failure.
 *
 * `context` names the pass in the thrown message. It is required rather than optional because the
 * six original messages were the only way to tell which write failed, and an optional argument is
 * one somebody omits.
 *
 * PER-COLUMN BATCHING IS DELIBERATE. Callers upsert partial rows — reach in one pass, day totals in
 * another, online-follower hours in a third — and an upsert only touches the keys it is given, so a
 * pass never nulls a column another pass owns. Do not "simplify" this into one whole-row write: the
 * comment at `syncAccountDay` records that reach is a series metric whose gaps are not zeros, and
 * folding it in would write an explicit NULL for every day the series skipped.
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
 * Two callers built this identical literal — the nightly consolidation recapture and the analytics
 * window refill — and a third builds a near-copy through a Map because it also has to de-duplicate.
 * That one stays where it is; forcing it through here would mean passing the Map in.
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

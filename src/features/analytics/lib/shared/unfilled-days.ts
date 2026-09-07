import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { shiftDateKey } from '@/utils/date-helpers'
import type { AnalyticsPeriod } from '../compute/period'

/**
 * "How much of this period has never been asked of Meta" — one rule, both networks.
 *
 * BOTH windows, never just the current one. Each report reads day rows from `period.prevStart`
 * and builds every "then" number and delta chip out of the earlier half, and this count is the
 * only thing that marks a day as never-asked. Narrow the span to the current window and the
 * comparison window is never fetched by anything: every delta then compares a full period
 * against whatever fragment the initial backfill happened to leave there.
 *
 * Minus today (still accruing) and minus the consolidation tail, whose re-asks are Meta still
 * settling numbers rather than absence.
 */

/** Recent days re-ask even when marked — Meta consolidates for a day or two after capture. */
export const REFRESH_TAIL_DAYS = 3

export interface MarkerRow {
  metric_date: string
  /** When this day's totals were last asked of Meta; null = never asked. */
  totals_synced_at: string | null
}

/** Which table holds a network's day rows, and which column scopes them to an account. */
export interface MarkerScope {
  table: 'ig_account_metrics' | 'fb_page_metrics'
  accountColumn: 'ig_account_id' | 'page_id'
  clientId: string
  accountId: string
}

export const igMarkers = (clientId: string, accountId: string): MarkerScope => ({
  table: 'ig_account_metrics',
  accountColumn: 'ig_account_id',
  clientId,
  accountId,
})

export const fbMarkers = (clientId: string, pageId: string): MarkerScope => ({
  table: 'fb_page_metrics',
  accountColumn: 'page_id',
  clientId,
  accountId: pageId,
})

/**
 * The period's stored day markers. Reads through whichever client the caller holds — the page
 * passes its RLS-scoped one.
 *
 * Account-scoped: the old account's asked-days must not suppress the refill a freshly connected
 * account needs.
 */
export async function readMarkerRows(
  db: SupabaseClient,
  scope: MarkerScope,
  period: AnalyticsPeriod
): Promise<MarkerRow[]> {
  const { data, error } = await db
    .from(scope.table)
    .select('metric_date, totals_synced_at')
    .eq('client_id', scope.clientId)
    .eq(scope.accountColumn, scope.accountId)
    .gte('metric_date', period.prevStart)
    .lte('metric_date', period.end)
  if (error) throw new Error(`window marker read failed: ${error.message}`)
  // WHY as: the shared client is untyped, so the projection does not infer.
  return (data ?? []) as MarkerRow[]
}

/** Days of BOTH windows that carry no marker — never asked, as opposed to asked and unserved. */
export function countUnfilledFrom(
  rows: MarkerRow[],
  period: AnalyticsPeriod,
  todayKey: string
): number {
  const tailStart = shiftDateKey(todayKey, -REFRESH_TAIL_DAYS)
  const markerByDate = new Map(rows.map((row) => [row.metric_date, row.totals_synced_at]))
  let unfilled = 0
  for (let key = period.end; key >= period.prevStart; key = shiftDateKey(key, -1)) {
    if (key >= todayKey || key >= tailStart) continue
    const marker = markerByDate.get(key)
    if (marker === undefined || marker === null) unfilled++
  }
  return unfilled
}

export async function countUnfilledDays(
  db: SupabaseClient,
  scope: MarkerScope,
  period: AnalyticsPeriod,
  todayKey: string
): Promise<number> {
  return countUnfilledFrom(await readMarkerRows(db, scope, period), period, todayKey)
}

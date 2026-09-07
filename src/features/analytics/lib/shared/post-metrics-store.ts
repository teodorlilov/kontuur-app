import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types'

export type PlatformPostMetricsInsert =
  Database['public']['Tables']['platform_post_metrics']['Insert']

/**
 * The upsert target, matching `platform_post_metrics_client_account_post_key` (20260845).
 *
 * Named once: passes writing different columns of the same media must land on the same row, and
 * a typo here silently creates a second one instead of failing. `platform` is in the key because
 * two networks that ever issued the same post id would otherwise overwrite each other.
 */
const MEDIA_KEY = 'client_id,platform,platform_account_id,external_post_id'

/**
 * Write media rows. The ONE way `platform_post_metrics` is written.
 *
 * PARTIAL ROWS ARE DELIBERATE, and they are the reason this exists. An upsert only touches the
 * columns it is given, so a pass never nulls a column another pass owns: the nightly syncs write
 * identity AND measurements, while the half-hourly comments sync writes identity ONLY, so the
 * queue can render a post commented on this morning instead of waiting for the 03:30 run. That
 * identity-only pass must NOT touch the measurement columns — a zero written there would be
 * indistinguishable from a measured zero on the analytics page.
 *
 * `context` names the pass in the thrown message: four call sites reach this, and "which write
 * failed" is otherwise unanswerable from the log.
 */
export async function upsertPostMetricRows(
  admin: SupabaseClient,
  rows: PlatformPostMetricsInsert[],
  context: string
): Promise<void> {
  if (rows.length === 0) return
  const { error } = await admin
    .from('platform_post_metrics')
    .upsert(rows, { onConflict: MEDIA_KEY })
  if (error) throw new Error(`platform_post_metrics upsert failed (${context}): ${error.message}`)
}

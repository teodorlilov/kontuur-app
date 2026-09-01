import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types'

/** A media row as any writer of one describes it. */
export type IGPostMetricsInsert = Database['public']['Tables']['ig_post_metrics']['Insert']

/**
 * The unique key every writer resolves against. Named once for the same reason
 * `account-metrics-store` names its day key: two passes writing different columns of
 * the same media must land on the same row, and a typo here would silently create a
 * second one instead of failing.
 */
const MEDIA_KEY = 'client_id,ig_account_id,ig_media_id'

/**
 * Write media rows. The ONE way `ig_post_metrics` is written.
 *
 * PARTIAL ROWS ARE DELIBERATE, and they are the reason this exists. An upsert only
 * touches the columns it is given, so a pass never nulls a column another pass owns.
 * Two callers rely on that:
 *
 *   - the nightly metrics sync writes whole rows — identity AND measurements
 *   - the half-hourly comments sync writes identity ONLY: what a media is (its
 *     caption, permalink, thumbnail, when it was posted, which Kontuur post it is)
 *
 * The second exists because the comments queue renders the post a comment sits under,
 * and depending on the nightly job for that meant a post commented on this morning
 * showed as an untitled grey box until 03:30 the next day. The comments sync already
 * holds those fields — `MEDIA_FIELDS` returns them on the same call it uses to
 * compare comment counts — so it records them rather than discarding them and
 * waiting.
 *
 * It must NOT write the measurement columns. Reach, views and the rest are the
 * nightly job's to establish; a zero written here would be indistinguishable from a
 * measured zero on the analytics page.
 *
 * `context` names the pass in the thrown message, required rather than optional
 * because "which write failed" is otherwise unanswerable from the log.
 */
export async function upsertPostMetricRows(
  admin: SupabaseClient,
  rows: IGPostMetricsInsert[],
  context: string
): Promise<void> {
  if (rows.length === 0) return
  const { error } = await admin.from('ig_post_metrics').upsert(rows, { onConflict: MEDIA_KEY })
  if (error) throw new Error(`ig_post_metrics upsert failed (${context}): ${error.message}`)
}

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types'

/** Derived, never restated — `src/types/__tests__/row-mirrors.test.ts` enforces that. */
export type FbPageMetricsInsert = Database['public']['Tables']['fb_page_metrics']['Insert']

/** Named once, as the Instagram store names its own: a typo in a spelled-out conflict target
 *  does not fail, it silently creates a second row for the same day. */
const DAY_KEY = 'client_id,page_id,metric_date'

/**
 * Write Page day rows. The ONE way `fb_page_metrics` is written.
 *
 * A separate store rather than a mode on `upsertAccountMetricDays` because the tables are separate
 * by decision (20260846: only five of `ig_account_metrics`' ~25 columns would have been shared),
 * and a shared writer over two tables is a `table` parameter every caller must get right.
 *
 * `context` names the pass in the thrown message, as the Instagram store requires. The NULL
 * contract travels through: an absent measure means Meta served nothing for that day, and the
 * upsert touching only the keys it is given is what keeps a later, fuller capture from being
 * overwritten with nulls.
 */
export async function upsertFbPageMetricDays(
  admin: SupabaseClient,
  rows: FbPageMetricsInsert[],
  context: string
): Promise<void> {
  if (rows.length === 0) return
  const { error } = await admin.from('fb_page_metrics').upsert(rows, { onConflict: DAY_KEY })
  if (error) throw new Error(`${context} upsert failed: ${error.message}`)
}

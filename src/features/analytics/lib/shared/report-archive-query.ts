import type { SupabaseClient } from '@supabase/supabase-js'
import type { ArchiveEntry } from '../../types'

/** The most recent exports a document lists. */
const ARCHIVE_LIMIT = 12

/**
 * One network's exported reports, newest first.
 *
 * Both networks archive into `analytics_reports`, so the platform AND account filters are
 * load-bearing: without the first a Facebook export lists under the Instagram document, and
 * without the second a report exported for a previously connected account resurfaces after a
 * reconnect.
 *
 * Reads through whichever client the caller holds; the page passes its RLS-scoped one. A failed
 * read logs and yields an empty archive: the report itself is worth rendering without its list
 * of past exports.
 */
export async function fetchReportArchive(
  db: SupabaseClient,
  clientId: string,
  platform: string,
  accountId: string
): Promise<ArchiveEntry[]> {
  const { data, error } = await db
    .from('analytics_reports')
    .select('id, period_start, period_end, created_at')
    .eq('client_id', clientId)
    .eq('platform', platform)
    .eq('platform_account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(ARCHIVE_LIMIT)
  if (error) {
    console.error(`[analytics] ${platform} archive list failed`, error)
    return []
  }
  // WHY as: the shared SupabaseClient param is untyped, so the projection does not infer.
  return (data ?? []) as ArchiveEntry[]
}

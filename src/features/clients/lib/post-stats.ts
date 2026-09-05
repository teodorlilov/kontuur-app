import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/** The four post counts and the last generation time the client settings page reports. */
interface ClientPostStats {
  pendingCount: number
  publishedCount: number
  scheduledCount: number
  approvedUnpublishedCount: number
  lastGeneratedAt: string | null
}

/**
 * Row shape of the `client_edit_stats` aggregate, derived now that the generated types carry it.
 *
 * `last_generated_at` is corrected on the way through: it is `MAX(created_at)`, which is NULL for
 * a client with no posts, and the generator types every aggregate as non-null because SQL does not
 * tell it otherwise. Taking the generated shape at its word would put a null behind a `string`.
 */
type ClientEditStatsRow = Omit<
  Database['public']['Functions']['client_edit_stats']['Returns'][number],
  'last_generated_at'
> & { last_generated_at: string | null }

const EMPTY: ClientPostStats = {
  pendingCount: 0,
  publishedCount: 0,
  scheduledCount: 0,
  approvedUnpublishedCount: 0,
  lastGeneratedAt: null,
}

/**
 * Post counts for one client, in a single round trip.
 *
 * Replaces five separate `head: true` counts that differed only by status filter. Each was cheap —
 * `idx_posts_client_id_status` covers them — so the cost was the round trips, not the queries.
 *
 * Ownership is the caller's to establish: the aggregate takes a client id and does not re-join
 * `clients` to re-check an agency the page has already verified.
 */
export async function fetchClientPostStats(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientPostStats> {
  const { data, error } = await supabase.rpc('client_edit_stats', { p_client_id: clientId })

  if (error) {
    console.error(`[clients:postStats] aggregate failed for ${clientId}:`, error.message)
    return EMPTY
  }

  const row = (data as ClientEditStatsRow[] | null)?.[0]
  if (!row) return EMPTY

  return {
    pendingCount: row.pending_count,
    publishedCount: row.published_count,
    scheduledCount: row.scheduled_count,
    approvedUnpublishedCount: row.approved_unpublished_count,
    lastGeneratedAt: row.last_generated_at,
  }
}

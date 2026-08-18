import type { SupabaseClient } from '@supabase/supabase-js'

/** The four post counts and the last generation time the client settings page reports. */
interface ClientPostStats {
  pendingCount: number
  publishedCount: number
  scheduledCount: number
  approvedUnpublishedCount: number
  lastGeneratedAt: string | null
}

/** Row shape of the `client_edit_stats` aggregate, fixed by 20260801_add_client_edit_stats_rpc.sql. */
interface ClientEditStatsRow {
  pending_count: number
  published_count: number
  scheduled_count: number
  approved_unpublished_count: number
  last_generated_at: string | null
}

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
  // WHY as: src/types/database.ts predates this function and regenerating it needs a working
  // SUPABASE_ACCESS_TOKEN, which the CLI currently rejects. The row shape is pinned by the
  // migration and verified against the live function. Drop both casts once types are regenerated.
  const { data, error } = await supabase.rpc(
    'client_edit_stats' as never,
    {
      p_client_id: clientId,
    } as never
  )

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

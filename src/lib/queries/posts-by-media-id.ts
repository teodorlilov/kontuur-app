import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Which Kontuur post is this Instagram media?
 *
 * The id the network handed back is stamped on the DESTINATION at publish time
 * (`post_publications.external_post_id`), and it is the only link between what we made
 * and what Instagram now holds. Both syncs that pull per-media data need it: the metrics
 * cron files insights under the post that earned them, and the comments cron files a
 * comment under the post it sits beneath, so the queue can render that post beside it
 * without resolving anything at read time.
 *
 * It read `posts.ig_media_id`, which migration 20260838 dropped — a media id belongs to
 * the destination that produced it, not to the content. Selecting a column that is gone is
 * not an empty result but an error, so both syncs threw on every run until this moved.
 *
 * Lived inside `sync-metrics.ts` as a module-private helper until the second caller
 * arrived. Moved rather than copied — a second `.in('ig_media_id', …)` with its own
 * null handling is exactly the drift this codebase gates against.
 *
 * Client-scoped on purpose. A media id is Instagram's, not ours, and nothing stops
 * two agencies' posts from colliding on one if an account is ever shared or moved;
 * scoping the lookup means a mismatch reads as "no post" rather than someone else's.
 *
 * Returns media id → post id. A media id with no Kontuur post is simply absent —
 * posts published outside the app are a normal case, not a failure.
 */
export async function fetchPostIdsByMediaId(
  admin: SupabaseClient,
  clientId: string,
  mediaIds: string[]
): Promise<Map<string, string>> {
  if (mediaIds.length === 0) return new Map()

  // Rooted at the destinations, with the client scope reaching through `posts!inner` as a
  // separate filter — the only form PostgREST accepts for filtering a parent by an embed.
  const { data, error } = await admin
    .from('post_publications')
    .select('post_id, external_post_id, posts!inner(client_id)')
    .eq('posts.client_id', clientId)
    .in('external_post_id', mediaIds)
  if (error) throw new Error(`posts join query failed: ${error.message}`)
  // WHY as: the shared SupabaseClient param is untyped, so the projection does not infer.
  const rows = (data ?? []) as Array<{ post_id: string; external_post_id: string | null }>
  // Still skipped when null: a network can publish and withhold the id, and such a row links
  // nothing.
  return new Map(
    rows.flatMap((row) =>
      row.external_post_id ? [[row.external_post_id, row.post_id] as const] : []
    )
  )
}

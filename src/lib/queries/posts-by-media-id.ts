import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Which Kontuur post is this Instagram media?
 *
 * `posts.ig_media_id` is stamped at publish time (`publish-post.ts`), and it is the
 * only link between what we made and what Instagram now holds. Both syncs that pull
 * per-media data need it: the metrics cron files insights under the post that earned
 * them, and the comments cron files a comment under the post it sits beneath, so the
 * queue can render that post beside it without resolving anything at read time.
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

  const { data, error } = await admin
    .from('posts')
    .select('id, ig_media_id')
    .eq('client_id', clientId)
    .in('ig_media_id', mediaIds)
  if (error) throw new Error(`posts join query failed: ${error.message}`)
  // WHY as: the shared SupabaseClient param is untyped, so the projection does not infer.
  const rows = (data ?? []) as Array<{ id: string; ig_media_id: string | null }>
  return new Map(
    rows.flatMap((row) => (row.ig_media_id ? [[row.ig_media_id, row.id] as const] : []))
  )
}

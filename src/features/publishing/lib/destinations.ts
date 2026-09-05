import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveNetwork } from '@/lib/meta/networks'
import { createPublications, type Publication } from '@/features/publishing/lib/publication-store'
import type { PostType } from '@/types/api'

/**
 * Where a post can go: the networks this client has connected that accept this kind of post.
 *
 * Two independent facts, and both have to hold. A network with no connection cannot be
 * published to however capable it is; a connected network that does not take carousels
 * cannot take this one. Neither is a property of the post alone, which is why this is a
 * query rather than a column.
 *
 * The capability half comes from the adapter (`accepts`), never from a list of publishable
 * platforms kept beside it — a list like that has to stay in agreement with the adapters,
 * and the list is what goes stale.
 */
async function resolveDestinations(
  admin: SupabaseClient,
  clientId: string,
  postType: PostType
): Promise<string[]> {
  // Narrow lookup, inline by convention: select-columns.ts covers full-row selects, and this
  // deliberately does not read a token — asking where a post CAN go is not asking to publish.
  const { data, error } = await admin
    .from('social_connections')
    .select('platform')
    .eq('client_id', clientId)
    .not('access_token', 'is', null)
  if (error) throw new Error(`destination lookup failed for client ${clientId}: ${error.message}`)

  return ((data ?? []) as Array<{ platform: string }>).flatMap((row) => {
    const adapter = resolveNetwork(row.platform)
    // Canva shares this table and is not a publishing network; it resolves to no adapter,
    // which is the same answer as "we cannot publish there" and needs no special case.
    return adapter?.accepts(postType) ? [adapter.platform] : []
  })
}

/**
 * Record the destinations a post's slot implies.
 *
 * The SLOT itself stays with the caller — the three writers stamp it differently (a batch update
 * by id, a fresh insert, a conditional stamp on publish-now) and folding that in would mean this
 * function wrote `posts` as well. What it owns is the half that was being pasted: resolve where
 * the post can go, then record it. The third slot writer pasted only the first half: `POST /api/posts` — the generate wizard's approve, the
 * primary way a post is created — stamped `status` and `scheduled_at` and created nothing. The
 * publish cron is rooted on `post_publications`, so those posts sat in the calendar looking
 * scheduled and could never go out, with nothing failing to say so.
 *
 * Returns what it recorded. An empty array is the answer worth acting on: the client has no
 * connected account that can take this post, so nothing will ever publish it. Idempotent through
 * `createPublications`, so re-scheduling a post cannot duplicate or reset its destinations.
 */
export async function assignDestinations(
  admin: SupabaseClient,
  postId: string,
  clientId: string,
  postType: PostType
): Promise<Publication[]> {
  const destinations = await resolveDestinations(admin, clientId, postType)
  if (destinations.length === 0) return []
  return createPublications(admin, postId, destinations)
}

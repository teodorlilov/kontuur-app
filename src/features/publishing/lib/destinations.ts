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
/**
 * Which of these connected platforms can take this kind of post.
 *
 * The pure half of the question, so the rule has one home. The query below reads it, and so do
 * the server components that tell a post where it COULD go — without either re-deriving
 * "carousels are Instagram-only" from a list kept beside the adapters. Capability is the
 * adapter's answer (`accepts`), never a constant, because a list like that goes stale.
 */
export function capableDestinations(connected: readonly string[], postType: PostType): string[] {
  return connected.flatMap((platform) => {
    const adapter = resolveNetwork(platform)
    // Canva shares this vocabulary and is not a publishing network; it resolves to no adapter,
    // which is the same answer as "we cannot publish there" and needs no special case.
    return adapter?.accepts(postType) ? [adapter.platform] : []
  })
}

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

  return capableDestinations(
    ((data ?? []) as Array<{ platform: string }>).map((row) => row.platform),
    postType
  )
}

/**
 * Record where a post is going, from the destinations its caller chose.
 *
 * The SLOT itself stays with the caller — the three writers stamp it differently (a batch update
 * by id, a fresh insert, a conditional stamp on publish-now) and folding that in would mean this
 * function wrote `posts` as well. What it owns is the half that was being pasted: decide the real
 * destinations, then record them. The third slot writer pasted only the first half — `POST
 * /api/posts`, the generate wizard's approve — so those posts sat in the calendar looking
 * scheduled while the cron, which is rooted on `post_publications`, could never see them.
 *
 * Returns what it recorded. An empty array is the answer worth acting on: nothing will publish
 * this post. Idempotent through `createPublications`, so re-scheduling cannot duplicate a
 * destination or reset an attempt counter a previous run earned.
 */
export async function assignDestinations(
  admin: SupabaseClient,
  postId: string,
  clientId: string,
  postType: PostType,
  /**
   * Which destinations to record. `'all'` is every one this post can reach — what a caller with
   * no choice to offer means, like publishing on demand or approving a draft straight into a
   * slot. An array narrows to those, and is what the calendar sends.
   *
   * Named rather than optional: "send it everywhere" and "send it to these" are different
   * intents, and an absent argument would leave which one a caller meant to be inferred.
   */
  chosen: readonly string[] | 'all'
): Promise<Publication[]> {
  const capable = await resolveDestinations(admin, clientId, postType)
  // Intersected, never taken on trust. An array arrives from a browser — a statement of intent,
  // not of fact — so what a post CAN reach stays the server's answer. A caller asking for a
  // network the client has not connected, or one that cannot take this post type, does not get it.
  const targets = chosen === 'all' ? capable : capable.filter((p) => chosen.includes(p))
  if (targets.length === 0) return []
  return createPublications(admin, postId, targets)
}

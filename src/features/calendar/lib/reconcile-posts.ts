import type { CalendarPost } from '@/types/api'

/**
 * Merge a fresh server list over the local one, post by post.
 *
 * The calendar seeds its state from the server and then patches it optimistically, so
 * once a refresh lands there are two versions of the truth. Replacing wholesale would
 * discard a mutation still in flight and any card the user has open; ignoring the
 * refresh entirely means the publish outcomes the cron produced never appear until a
 * hard reload — which is the whole reason the page refreshes on focus.
 *
 * So the decision is made **per post**: the server is authoritative for everything
 * except the few posts the user is currently touching.
 *
 * The server list decides membership. A post it no longer returns has left the five
 * statuses this page queries — published-and-archived, deleted, moved back to draft —
 * and keeping a local copy of it would leave a row on screen that no longer exists
 * anywhere else.
 *
 * Pure, and therefore the only part of the refresh path the node-environment suite can
 * actually reach.
 */
export function reconcilePosts(
  local: CalendarPost[],
  server: CalendarPost[],
  /** Posts to keep the local version of: mutations in flight, and the open card. */
  protectedIds: ReadonlySet<string>
): CalendarPost[] {
  if (protectedIds.size === 0) return server

  const localById = new Map(local.map((post) => [post.id, post]))
  return server.map((post) => (protectedIds.has(post.id) ? (localById.get(post.id) ?? post) : post))
}

/**
 * Where a published post can be seen, per destination.
 *
 * One home for the shape so the route that answers and the card that asks cannot drift, and so
 * the card does not reach into `app/` for a type.
 */

export interface LiveLink {
  platform: string
  /** Null when the network no longer has the post, or will not say where it is. */
  url: string | null
}

/**
 * Ask where a post went live. Resolved by the network on demand, so a post deleted there
 * answers `url: null` rather than handing back a link that 404s.
 *
 * Returns an empty list rather than throwing: this decorates a card that is perfectly usable
 * without it, and a failed lookup must not take the card down.
 */
export async function fetchLiveLinks(postId: string): Promise<LiveLink[]> {
  try {
    const res = await fetch(`/api/posts/${postId}/live`)
    if (!res.ok) return []
    const { links } = (await res.json()) as { links?: LiveLink[] }
    return links ?? []
  } catch {
    return []
  }
}

import type { CommentGroup } from '@/types/api'
import { namePlatforms } from '@/lib/validation'
import { toPreviewLine } from '@/utils/format'

/**
 * What to call a post, including when we know almost nothing about it.
 *
 * Shared by the queue's group header and the detail pane so the same post cannot be
 * named two different things a few hundred pixels apart.
 *
 * Three cases, and the middle one is the whole reason this exists:
 *
 *   - we have the caption → use it
 *   - we have the post but it has no caption → "Untitled post", which is true
 *   - we have NO post row → we published nothing matching this media, so calling it
 *     "Untitled post" claims a record we do not have. It shipped that way and read
 *     as a bug: an unnamed row above a blank grey square looks like a failed load.
 */
export function postTitle(group: Pick<CommentGroup, 'caption' | 'postId' | 'platform'>): string {
  if (group.caption) return toPreviewLine(group.caption)
  // Named from the group, not written in: this said "Post on Instagram" over every Facebook
  // conversation in the queue, which is the one thing a header must not get wrong.
  return group.postId ? 'Untitled post' : `Post on ${namePlatforms([group.platform])}`
}

/**
 * Why a post has no picture and no words, when it has none.
 *
 * Deliberately states what we know rather than guessing why. `post_id` is null
 * either because the post was never published from Kontuur, or because its row was
 * deleted afterwards — the sync resolves it from `post_publications.external_post_id`
 * and the link is ON DELETE SET NULL. "Published outside Kontuur" would be wrong in
 * the second case, and the difference is invisible from here.
 *
 * Null when there is nothing to explain.
 */
export function postOrigin(group: Pick<CommentGroup, 'postId'>): string | null {
  return group.postId ? null : 'no matching post in Kontuur'
}

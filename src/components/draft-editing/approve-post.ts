import { savePostCopy, schedulePost } from '@/lib/actions/post-actions'
import type { ActionResult } from '@/lib/actions/types'
import type { DraftEdits } from './use-draft-edits'

/** The reviewer's working copy onto its row — what every autosave flush and every approve sends. */
export function saveDraftCopy(postId: string, edits: DraftEdits): Promise<ActionResult> {
  return savePostCopy(postId, { caption: edits.caption, slides_json: edits.slidesJson })
}

/**
 * Approve a draft row with the reviewer's working copy — the one approve both review surfaces
 * run (the queue optimistically, the generate flow blocking).
 *
 * The copy and the workflow move are two writes, through the two functions that own them, and
 * the first is skipped when there is nothing to write: `edits` is null for a draft nobody
 * touched, so approve-all over an untouched run is one action per draft, not two. Copy first: if
 * the status write fails, the caller's rollback restores the draft and the reviewer's typing has
 * still been saved; the reverse order could approve a post carrying stale text. `savePostCopy`
 * deliberately skips the client-post-stats revalidation and does not need to — `schedulePosts`
 * busts that tag after the status write, which is the write that changes a count.
 *
 * `platforms` is where the post can go — both surfaces pass the networks the client can publish
 * this format to (`capableDestinations`); the calendar is where destinations get narrowed.
 */
export async function approvePost(
  postId: string,
  edits: DraftEdits | null,
  scheduledAt: string | null,
  platforms: readonly string[]
): Promise<ActionResult<{ nowhereToGo: boolean }>> {
  if (edits) {
    const copy = await saveDraftCopy(postId, edits)
    if (!copy.ok) return copy
  }
  return schedulePost(postId, scheduledAt, platforms)
}

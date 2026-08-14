'use server'

import 'server-only'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { resolveActionAuth, verifyPostOwnership } from '@/lib/auth/helpers'
import type { ActionResult } from '@/lib/actions/types'

const rearmSchema = z.object({
  /** Where to put it back on the calendar. Same contract as `updatePostSchema`'s. */
  scheduledAt: z.iso.datetime({ offset: true }),
})

/**
 * Return a failed post to the publish queue.
 *
 * Two independent things stopped this being possible, and both had to be answered:
 *
 * 1. `'failed'` is absent from `USER_SETTABLE_POST_STATUSES`, so `updatePost` refuses
 *    to move a post out of it. That list is not widened here — it exists so the
 *    pipeline owns `publishing`/`published`/`failed`, and a user who can set them by
 *    hand can corrupt the scheduler's view of what is still to send.
 * 2. `publish_attempts` is never reset anywhere, while `publishDuePosts` filters
 *    `.lt('publish_attempts', 3)`. A post flipped back to `scheduled` with three
 *    attempts on it would sit in the calendar looking queued and never be picked up —
 *    a silent failure worse than the visible one it replaced.
 *
 * So this clears the error, the attempt count and any stale claim in **one write**,
 * guarded on the row still being `failed`: two people re-arming the same post, or a
 * re-arm racing the cron's own retry, must not resurrect a post that has since
 * published.
 */
export async function rearmFailedPost(
  postId: string,
  input: { scheduledAt: string }
): Promise<ActionResult> {
  const parsed = rearmSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid schedule time' }

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const post = await verifyPostOwnership(supabase, postId, agencyId)
  if (!post) return { ok: false, error: 'Post not found' }

  const { data, error } = await supabase
    .from('posts')
    .update({
      status: 'scheduled',
      scheduled_at: parsed.data.scheduledAt,
      publish_error: null,
      publish_attempts: 0,
      // The scheduler treats a claim as a lease. Leaving a dead one behind would make
      // the row look claimed until it went stale on its own.
      publish_claimed_at: null,
    })
    .eq('id', postId)
    .eq('status', 'failed')
    .select('id')

  if (error) return { ok: false, error: error.message }
  // Zero rows means the guard above rejected it, not that the write was lost.
  if (!data || data.length === 0) return { ok: false, error: 'This post is no longer failed' }

  revalidateTag('client-post-stats', 'max')
  return { ok: true, data: undefined }
}

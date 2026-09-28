'use server'

import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { statusForSlot } from '@/lib/posts/status-for-slot'
import 'server-only'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { resolveActionAuth, fetchOwnedPost } from '@/lib/auth/helpers'
import { rearmPublication } from '@/features/publishing/lib/publication-store'
import { requireEntitledAction } from '@/lib/billing/require-entitled'
import { validateInstagramCaption } from '@/lib/meta/networks/instagram-caption'
import type { ActionResult } from '@/lib/actions/types'

const rearmSchema = z.object({
  /** Where to put it back on the calendar. Same contract as `updatePostSchema`'s. */
  scheduledAt: z.iso.datetime({ offset: true }),
})

/**
 * Return a failed DESTINATION to the publish queue — not the post, which may already be live on
 * another network. `rearmPublication` is the only reset of `publish_attempts`, which the
 * scheduler's due query caps (src/features/publishing/lib/scheduler.ts): flipped back with its
 * attempts spent, a destination would look queued and never go out. Re-arming is scheduling, so it
 * carries `schedulePosts`'s publish gate and Instagram caption check
 * (src/lib/actions/post-actions.ts) before any write. The slot moves on the post, for every
 * destination, and FIRST: re-armed before a slot write that then failed, the destination would
 * retry at the old, already-past slot.
 */
export async function rearmFailedPublication(
  publicationId: string,
  input: { scheduledAt: string }
): Promise<ActionResult> {
  const parsed = rearmSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid schedule time' }

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth
  const refused = await requireEntitledAction(agencyId, 'publish')
  if (refused) return refused

  const admin = createAdminSupabaseClient()
  const { data: publication, error: readError } = await admin
    .from('post_publications')
    .select('post_id, platform, posts(caption)')
    .eq('id', publicationId)
    .maybeSingle()
  if (readError) {
    console.error(
      `[calendar:rearm] publication read failed for ${publicationId}:`,
      readError.message
    )
    return { ok: false, error: 'Could not put the post back in the queue. Please try again.' }
  }
  if (!publication) return { ok: false, error: 'Not found' }

  const post = await fetchOwnedPost(supabase, publication.post_id, agencyId)
  if (!post) return { ok: false, error: 'Post not found' }

  if (publication.platform === 'instagram') {
    const problem = validateInstagramCaption(publication.posts?.caption ?? '')
    if (problem) return { ok: false, error: problem }
  }

  const { error: slotError } = await supabase
    .from('posts')
    .update({
      scheduled_at: parsed.data.scheduledAt,
      status: statusForSlot(parsed.data.scheduledAt),
    })
    .eq('id', publication.post_id)
  if (slotError) return { ok: false, error: slotError.message }

  const { rearmed, error } = await rearmPublication(admin, publicationId)
  if (error) return { ok: false, error }
  if (!rearmed) return { ok: false, error: 'This post is no longer failed' }

  revalidateTag('client-post-stats', 'max')
  return { ok: true, data: undefined }
}

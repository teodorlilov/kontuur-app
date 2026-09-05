'use server'

import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { statusForSlot } from '@/lib/posts/status-for-slot'
import 'server-only'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { resolveActionAuth, fetchOwnedPost } from '@/lib/auth/helpers'
import { rearmPublication } from '@/features/publishing/lib/publication-store'
import type { ActionResult } from '@/lib/actions/types'

const rearmSchema = z.object({
  /** Where to put it back on the calendar. Same contract as `updatePostSchema`'s. */
  scheduledAt: z.iso.datetime({ offset: true }),
})

/**
 * Return a failed destination to the publish queue.
 *
 * `publish_attempts` is never reset anywhere else, while the scheduler filters
 * `.lt('publish_attempts', 3)`. A destination flipped back to `scheduled` with three
 * attempts on it would sit in the calendar looking queued and never be picked up — a
 * silent failure worse than the visible one it replaced. `rearmPublication` is the only
 * place that reset happens, which is what keeps it from competing with the ladder.
 *
 * Re-arming targets a DESTINATION, not the post: a post that reached Instagram and failed
 * on Facebook has one thing to retry, and resetting the post would either resend what is
 * already live or leave the real failure untouched.
 *
 * The slot moves on the post because when it goes out is a property of the content — every
 * destination waiting on it moves together.
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

  const admin = createAdminSupabaseClient()
  const { data: row } = await admin
    .from('post_publications')
    .select('post_id')
    .eq('id', publicationId)
    .maybeSingle()
  const publication = row as { post_id: string } | null
  if (!publication) return { ok: false, error: 'Not found' }

  // Ownership is proved against the POST, which is the thing that belongs to a client.
  const post = await fetchOwnedPost(supabase, publication.post_id, agencyId)
  if (!post) return { ok: false, error: 'Post not found' }

  /**
   * The slot moves FIRST, and the destination is re-armed against it.
   *
   * The other order put the publication back in the queue while its post still carried the
   * old, already-past slot — so a failed slot write left the cron free to retry immediately, at
   * the wrong time, while the user was being told the retry had failed. This way a failed
   * re-arm leaves the post with a new slot and its destination still 'failed': nothing
   * publishes, and the button is still there to press.
   */
  const { error: slotError } = await supabase
    .from('posts')
    .update({
      scheduled_at: parsed.data.scheduledAt,
      // Paired, never written alone — the calendar lanes split on exactly this couple.
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

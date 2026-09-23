'use server'

import 'server-only'
import { z } from 'zod'
import { resolveActionAuth, verifyPostsOwnership } from '@/lib/auth/helpers'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchImagesByPost } from '@/lib/posts/fetch-post-images'
import { fetchVisualJobs } from '@/lib/visual/visual-jobs'
import type { ActionResult } from '@/lib/actions/types'
import type { PostImage } from '@/types/api'

const visualProgressSchema = z.object({ postIds: z.array(z.uuid()).min(1).max(50) })

/** Where one post's pictures have got to: what has landed, and what is still being made. */
interface VisualProgress {
  postId: string
  images: PostImage[]
  generatingPositions: number[]
}

/**
 * What has landed for these posts, and what is still being made — the answer a surface cannot get
 * for itself once it is on screen.
 *
 * A picture takes about a minute and leaves no trace until it lands, so a reviewer who returns to a
 * run mid-generation sees slides marked as being made by something they cannot hear from. This is
 * what the poll behind those slides asks, and it stops as soon as they are done. It composes the
 * two reads the page load already uses (`fetchImagesByPost`, `fetchVisualJobs`) rather than adding
 * a third way to ask; the ids are narrowed to the caller's own agency first, because both of those
 * run as the service role.
 */
export async function fetchVisualProgress(
  postIds: string[]
): Promise<ActionResult<VisualProgress[]>> {
  const parsed = visualProgressSchema.safeParse({ postIds })
  if (!parsed.success) return { ok: false, error: 'Invalid post ids' }

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }

  const owned = await verifyPostsOwnership(auth.supabase, parsed.data.postIds, auth.agencyId)
  const ids = parsed.data.postIds.filter((id) => owned.has(id))
  if (ids.length === 0) return { ok: true, data: [] }

  try {
    const [imagesByPost, jobsByPost] = await Promise.all([
      fetchImagesByPost(ids),
      fetchVisualJobs(createAdminSupabaseClient(), ids),
    ])
    return {
      ok: true,
      data: ids.map((postId) => ({
        postId,
        images: imagesByPost.get(postId) ?? [],
        generatingPositions: jobsByPost.get(postId) ?? [],
      })),
    }
  } catch (err) {
    console.error('[visual-progress] read failed:', err)
    return { ok: false, error: 'Could not read the visuals' }
  }
}

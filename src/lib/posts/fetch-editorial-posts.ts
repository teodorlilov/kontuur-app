import 'server-only'

import type { SupabaseServerClient } from '@/lib/auth/helpers'
import { POST_COLUMNS, type PostColumns } from '@/lib/queries/select-columns'
import { fetchCanvasDocPositions, fetchImagesByPost } from '@/lib/posts/fetch-post-images'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchVisualJobs } from '@/lib/visual/visual-jobs'
import {
  fallbackValidationData,
  needsSlopFallback,
  toValidationData,
} from '@/lib/validation/adapt-validation'
import type { UndecidedPostStatus } from '@/lib/validation'
import type { PostImage, ValidationData } from '@/types/api'

/**
 * A post a reviewer has not decided on, with everything the shared review leaves render: its
 * evidence adapted server-side (the client never parses, or bundles, the stored-validation
 * schema), its images, which positions already carry a canvas doc (the compose-on-open gate), and
 * which are being generated right now. The review queue adds its own fields on top; the generate
 * flow groups these by client and format.
 */
export interface EditorialPost {
  post: PostColumns
  validation: ValidationData
  /** True for legacy rows whose authenticity was never measured — the surface runs one
   *  detect-slop call on focus for these. */
  needsSlopCheck: boolean
  images: PostImage[]
  composedPositions: number[]
  /** Positions whose picture is being generated right now — neither missing nor finished, so a
   *  surface shows them as generating and never asks for them again. */
  generatingPositions: number[]
}

/**
 * The one read of undecided posts for a review surface — the queue's `pending_review` rows and
 * the wizard's `'draft'` rows are the same query with a different status. Oldest first: a queue
 * drains, it does not silt up, and a run reads back in the order it was written.
 *
 * Throws on a failed post query: an empty list is a real answer ("nothing waiting"), so a
 * failure must not be allowed to look like one. The image, doc and claim reads throw for the same
 * reason — a missed claim would have a surface generate a picture that is already being made.
 */
export async function fetchEditorialPosts(
  supabase: SupabaseServerClient,
  clientIds: string[],
  status: UndecidedPostStatus
): Promise<EditorialPost[]> {
  if (clientIds.length === 0) return []

  const { data, error } = await supabase
    .from('posts')
    .select(POST_COLUMNS)
    .in('client_id', clientIds)
    .eq('status', status)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`editorial post query failed: ${error.message}`)

  const rows = data ?? []
  const postIds = rows.map((row) => row.id)
  const [imagesByPost, composedByPost, jobsByPost] = await Promise.all([
    fetchImagesByPost(postIds),
    fetchCanvasDocPositions(postIds),
    fetchVisualJobs(createAdminSupabaseClient(), postIds),
  ])

  return rows.map((post) => ({
    post,
    validation:
      toValidationData(post.validation_json) ?? fallbackValidationData(post.quality_score_avg),
    needsSlopCheck: needsSlopFallback(post.validation_json),
    images: imagesByPost.get(post.id) ?? [],
    composedPositions: composedByPost.get(post.id) ?? [],
    generatingPositions: jobsByPost.get(post.id) ?? [],
  }))
}

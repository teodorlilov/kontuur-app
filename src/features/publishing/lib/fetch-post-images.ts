import 'server-only'

import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { POST_IMAGE_COLUMNS } from '@/lib/queries/select-columns'
import { mapImageRow } from './map-image-row'
import type { PostImage } from '@/types/api'
import type { PostImageRow } from '@/types/index'

/**
 * Which positions of each post already carry a canvas doc — the queue's
 * compose-on-open gate (doc-less AI art still needs its text baked). Admin
 * client for the same RLS reason as the images fetch; callers must only pass
 * ids of posts they have already authorized.
 */
export async function fetchCanvasDocPositions(postIds: string[]): Promise<Map<string, number[]>> {
  const byPost = new Map<string, number[]>()
  if (postIds.length === 0) return byPost

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('post_canvas_docs')
    .select('post_id, position')
    .in('post_id', postIds)
  // Swallowing this would present "compose already done" for every post.
  if (error) throw new Error(`canvas doc position query failed: ${error.message}`)
  for (const row of data ?? []) {
    const positions = byPost.get(row.post_id) ?? []
    positions.push(row.position)
    byPost.set(row.post_id, positions)
  }
  return byPost
}

/**
 * Fetch images for a set of posts, grouped by post id and ordered by position. Uses the admin client
 * because `post_images` has RLS that blocks the user-scoped client — callers must only pass ids of
 * posts they have already authorized.
 */
export async function fetchImagesByPost(postIds: string[]): Promise<Map<string, PostImage[]>> {
  const imagesByPost = new Map<string, PostImage[]>()
  if (postIds.length === 0) return imagesByPost

  const admin = createAdminSupabaseClient()
  const { data: imageRows, error } = await admin
    .from('post_images')
    .select(POST_IMAGE_COLUMNS)
    .in('post_id', postIds)
    .order('position', { ascending: true })
  // A dropped error here renders as posts with no art, which is what the empty
  // calendar looked like when this failed silently before.
  if (error) throw new Error(`post image query failed: ${error.message}`)

  // as: explicit column projection — Supabase types from the table, not the select
  for (const row of (imageRows as PostImageRow[] | null) ?? []) {
    const list = imagesByPost.get(row.post_id) ?? []
    list.push(mapImageRow(row))
    imagesByPost.set(row.post_id, list)
  }
  return imagesByPost
}

import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { POST_IMAGE_COLUMNS } from '@/lib/queries/select-columns'
import { mapImageRow } from './map-image-row'
import type { PostImage } from '@/types/api'
import type { PostImageRow } from '@/types/index'

/**
 * Fetch images for a set of posts, grouped by post id and ordered by position. Uses the admin client
 * because `post_images` has RLS that blocks the user-scoped client — callers must only pass ids of
 * posts they have already authorized.
 */
export async function fetchImagesByPost(postIds: string[]): Promise<Map<string, PostImage[]>> {
  const imagesByPost = new Map<string, PostImage[]>()
  if (postIds.length === 0) return imagesByPost

  const admin = createAdminSupabaseClient()
  const { data: imageRows } = await admin
    .from('post_images')
    .select(POST_IMAGE_COLUMNS)
    .in('post_id', postIds)
    .order('position', { ascending: true })

  for (const row of (imageRows as PostImageRow[] | null) ?? []) {
    const list = imagesByPost.get(row.post_id) ?? []
    list.push(mapImageRow(row))
    imagesByPost.set(row.post_id, list)
  }
  return imagesByPost
}

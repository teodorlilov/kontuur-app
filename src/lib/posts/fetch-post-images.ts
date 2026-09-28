import 'server-only'

import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { POST_IMAGE_COLUMNS } from '@/lib/queries/select-columns'
import { mapImageRow } from '@/lib/posts/map-image-row'
import type { PostImage } from '@/types/api'

/**
 * The bulk read of a post's images.
 *
 * Lived under `features/assets` until the comments queue became its sixth importer
 * and `npm run arch` pointed out that none of the six is inside that feature — the
 * asset editor never called it. It reads `post_images` for whoever holds authorized
 * post ids, which is a shared concern, so it belongs beside `map-image-row` that it
 * already uses rather than inside a feature that had stopped describing it.
 */

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
 * How many posts' images one request asks for. PostgREST answers at most 1000 rows and cuts the
 * rest without an error; at `MAX_CAROUSEL_SLIDES` (10) images a post, 50 posts stay well inside it.
 */
const IMAGE_READ_CHUNK = 50

/**
 * Fetch images for a set of posts, grouped by post id and ordered by position — read in chunks of
 * `IMAGE_READ_CHUNK` posts, so a large set is never silently cut short. Uses the admin client
 * because `post_images` has RLS that blocks the user-scoped client — callers must only pass ids of
 * posts they have already authorized. Throws on a failed read: a dropped error would render as
 * posts with no art.
 */
export async function fetchImagesByPost(postIds: string[]): Promise<Map<string, PostImage[]>> {
  const imagesByPost = new Map<string, PostImage[]>()
  if (postIds.length === 0) return imagesByPost

  const admin = createAdminSupabaseClient()
  const chunks: string[][] = []
  for (let start = 0; start < postIds.length; start += IMAGE_READ_CHUNK) {
    chunks.push(postIds.slice(start, start + IMAGE_READ_CHUNK))
  }
  const reads = await Promise.all(
    chunks.map((ids) =>
      admin
        .from('post_images')
        .select(POST_IMAGE_COLUMNS)
        .in('post_id', ids)
        .order('position', { ascending: true })
    )
  )
  const failed = reads.find((read) => read.error)
  if (failed?.error) throw new Error(`post image query failed: ${failed.error.message}`)
  const imageRows = reads.flatMap((read) => read.data ?? [])

  for (const row of imageRows) {
    const list = imagesByPost.get(row.post_id) ?? []
    list.push(mapImageRow(row))
    imagesByPost.set(row.post_id, list)
  }
  return imagesByPost
}

/**
 * The URL a post is shown by: its first image by position, or null when it has none. The one
 * spelling of `get(id)?.[0]?.publicUrl` — three readers (the review queue, the comments queue,
 * My week) each need exactly this off the map `fetchImagesByPost` returns.
 */
export function firstPublicUrl(
  imagesByPost: ReadonlyMap<string, ReadonlyArray<{ publicUrl: string }>>,
  postId: string
): string | null {
  return imagesByPost.get(postId)?.[0]?.publicUrl ?? null
}

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AdminClient } from '@/lib/supabase/admin'
import { fetchImagesByPost } from '@/lib/posts/fetch-post-images'
import { readPages } from '@/lib/queries/read-pages'
import { VISUAL_BACKLOG_POST_COLUMNS } from '@/lib/queries/select-columns'
import type { UndecidedPostStatus } from '@/lib/validation'
import { QUALITY_FLOOR } from '@/utils/constants'
import type { PostImage } from '@/types/api'
import { MAX_VISUAL_ATTEMPTS, type BacklogPost } from './visual-backlog'
import { fetchVisualJobs } from './visual-jobs'

/**
 * Posts one page holds: their ids ride in the URL of the claims read, and PostgREST answers at
 * most 1000 rows, so a page stays small.
 */
const POST_PAGE = 100

/** One page of posts, with their stored pictures and the positions a live claim is painting. */
interface PostVisualsPage {
  posts: BacklogPost[]
  imagesByPost: Map<string, PostImage[]>
  generatingByPost: Map<string, number[]>
}

/**
 * These posts' stored pictures and the positions a live claim is painting, read together — the
 * two facts every "which positions still owe a picture" answer needs (`missingPositions`,
 * visual-backlog.ts). Throws when either read fails: a claim read as absent would show a position
 * being painted as missing, and a picture read as absent would show a painted one as owed.
 */
export async function fetchPostVisuals(
  admin: SupabaseClient,
  postIds: string[]
): Promise<{
  imagesByPost: Map<string, PostImage[]>
  generatingByPost: Map<string, number[]>
}> {
  const [imagesByPost, generatingByPost] = await Promise.all([
    fetchImagesByPost(postIds),
    fetchVisualJobs(admin, postIds),
  ])
  return { imagesByPost, generatingByPost }
}

/**
 * These clients' posts in `statuses`, oldest first, a page of `POST_PAGE` at a time (`readPages`,
 * ordered on `id` after `created_at`, since a batch inserted in one statement shares one
 * `created_at`), each page yielded with its visuals (`fetchPostVisuals`). With `paintableBefore`,
 * only the posts the visuals cron may paint now — attempts left, above the quality floor, last tried
 * before that instant — the gates `pickVisualBacklog` applies (visual-backlog.ts). Any read failing
 * throws from the iteration, after the pages before it were yielded.
 */
export async function* readPostVisualPages(
  admin: AdminClient,
  clientIds: string[],
  statuses: readonly UndecidedPostStatus[],
  paintableBefore?: string
): AsyncGenerator<PostVisualsPage> {
  const pages = readPages(
    'post visuals read',
    (from, to) => {
      let query = admin
        .from('posts')
        .select(VISUAL_BACKLOG_POST_COLUMNS)
        .in('client_id', clientIds)
        .in('status', statuses)
      if (paintableBefore) {
        query = query
          .lt('visuals_attempts', MAX_VISUAL_ATTEMPTS)
          .or(`quality_score_avg.is.null,quality_score_avg.gte.${QUALITY_FLOOR}`)
          .or(`visuals_attempted_at.is.null,visuals_attempted_at.lt.${paintableBefore}`)
      }
      return query
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    },
    POST_PAGE
  )
  for await (const posts of pages) {
    yield {
      posts,
      ...(await fetchPostVisuals(
        admin,
        posts.map((post) => post.id)
      )),
    }
  }
}

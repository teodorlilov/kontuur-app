import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { PENDING_PREVIEW_COLUMNS } from '@/lib/queries/select-columns'
import { fetchImagesByPost } from '@/features/publishing/lib/fetch-post-images'

/** The dashboard queue scrolls, so it holds more than a glance's worth. */
const PENDING_PREVIEW_LIMIT = 12

/** A queued draft with its thumbnail already resolved, before the client name is attached. */
interface ReviewQueueRow {
  id: string
  caption: string
  platform: string
  pillar: string | null
  created_at: string
  client_id: string
  imageUrl: string | null
}

/**
 * The newest drafts awaiting review, each with its first image.
 *
 * The image lookup lives inside this cached entry rather than beside it: it depends on the post
 * ids this query returns, so keeping the two together means a cache hit skips both round trips
 * instead of just the first.
 *
 * Shortest TTL of the dashboard readers (30s, matching `getCachedPendingRows`) because this is the
 * queue a user actively works through.
 */
const fetchReviewQueue = unstable_cache(
  async (agencyId: string): Promise<ReviewQueueRow[]> => {
    const supabase = createAdminSupabaseClient()
    const { data, error } = await supabase
      .from('posts')
      .select(PENDING_PREVIEW_COLUMNS)
      .eq('clients.agency_id', agencyId)
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false })
      .limit(PENDING_PREVIEW_LIMIT)

    if (error) {
      console.error('[dashboard] pending posts query failed:', error.message)
      return []
    }

    // WHY as: the clients!inner join is a filter only; its column is never read.
    const rows = (data ?? []) as unknown as Array<Omit<ReviewQueueRow, 'imageUrl'>>
    // Admin-client read: post_images RLS blocks the user-scoped client. Safe because the ids come
    // from posts already scoped to this agency above.
    const imagesByPost = await fetchImagesByPost(rows.map((row) => row.id))

    return rows.map((row) => ({
      ...row,
      imageUrl: imagesByPost.get(row.id)?.[0]?.publicUrl ?? null,
    }))
  },
  ['dashboard-review-queue'],
  { revalidate: 30, tags: ['client-post-stats'] }
)

export const getCachedReviewQueue = cache(fetchReviewQueue)

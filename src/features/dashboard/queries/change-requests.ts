import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { BATCH_POSITION_COLUMNS, CHANGE_REQUEST_COLUMNS } from '@/lib/queries/select-columns'
import type { CarouselSlide } from '@/types/api'
import type { PostRow } from '@/types'

const CHANGE_REQUEST_LIMIT = 5

type ChangeRequestRow = Pick<
  PostRow,
  'id' | 'client_id' | 'caption' | 'platform' | 'post_type' | 'scheduled_at'
> & {
  slides_json: unknown
  post_approval_tokens: Array<{
    status: string
    client_note: string | null
    responded_at: string | null
    batch_id: string
  }>
}

/** A post the client asked changes on, with everything but its client name resolved. */
interface ChangeRequest {
  id: string
  clientId: string
  caption: string | null
  platform: string
  postType: string
  slidesJson: CarouselSlide[] | null
  scheduledAt: string | null
  clientNote: string | null
  respondedAt: string | null
  postNumber: number
}

/**
 * Maps each post to its 1-indexed place within the approval batch it was sent in.
 *
 * Deliberately unfiltered by agency, and that is only safe because of where `batchIds` comes from:
 * the caller derives them from a query already scoped to this agency, and a batch is sent for one
 * client, so it cannot span two. Worth stating because the caller runs on the admin client — RLS
 * is not standing behind this the way it did when the read was user-scoped.
 */
async function fetchBatchPositions(
  supabase: SupabaseClient,
  batchIds: string[]
): Promise<Map<string, number>> {
  if (batchIds.length === 0) return new Map()

  // Positions come from this order alone, so an unread failure would silently
  // label every post "Post #1".
  const { data, error } = await supabase
    .from('post_approval_tokens')
    .select(BATCH_POSITION_COLUMNS)
    .in('batch_id', batchIds)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`batch position query failed: ${error.message}`)

  const batchOrder = new Map<string, string[]>()
  for (const token of (data as Array<{ batch_id: string | null; post_id: string | null }> | null) ??
    []) {
    if (!token.batch_id || !token.post_id) continue
    const ids = batchOrder.get(token.batch_id) ?? []
    ids.push(token.post_id)
    batchOrder.set(token.batch_id, ids)
  }

  const positions = new Map<string, number>()
  for (const [, postIds] of batchOrder) {
    postIds.forEach((postId, index) => positions.set(postId, index + 1))
  }
  return positions
}

/**
 * Posts whose client asked for changes, newest scheduled first.
 *
 * The batch-position lookup is inside this entry because it depends on the batch ids this query
 * returns — cached together, a hit skips both queries.
 */
const fetchChangeRequests = unstable_cache(
  async (agencyId: string): Promise<ChangeRequest[]> => {
    const supabase = createAdminSupabaseClient()
    const { data, error } = await supabase
      .from('posts')
      .select(CHANGE_REQUEST_COLUMNS)
      .eq('clients.agency_id', agencyId)
      .eq('post_approval_tokens.status', 'changes_requested')
      .order('scheduled_at', { ascending: false })
      .limit(CHANGE_REQUEST_LIMIT)

    if (error) {
      console.error('[dashboard] change requests query failed:', error.message)
      return []
    }

    // WHY as: PostgREST returns embedded selects untyped, and the clients!inner join is a filter
    // whose column is never read.
    const rows = (data ?? []) as unknown as ChangeRequestRow[]
    if (rows.length === 0) return []

    const batchIds = [
      ...new Set(
        rows
          .flatMap((row) => row.post_approval_tokens.map((token) => token.batch_id))
          .filter(Boolean)
      ),
    ]
    const positions = await fetchBatchPositions(supabase, batchIds)

    return rows.map((row) => {
      const token = row.post_approval_tokens[0]!
      return {
        id: row.id,
        clientId: row.client_id,
        caption: row.caption,
        platform: row.platform,
        postType: row.post_type,
        slidesJson: row.slides_json as CarouselSlide[] | null,
        scheduledAt: row.scheduled_at,
        clientNote: token.client_note,
        respondedAt: token.responded_at,
        postNumber: positions.get(row.id) ?? 1,
      }
    })
  },
  ['dashboard-change-requests'],
  { revalidate: 60, tags: ['client-post-stats'] }
)

export const getCachedChangeRequests = cache(fetchChangeRequests)

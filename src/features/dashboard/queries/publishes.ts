import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { UPCOMING_POST_COLUMNS } from '@/lib/queries/select-columns'
import type { PostSummary } from '@/types/post'

/** At 3–8 publishes a day, three rows answer "what's next" without becoming a feed. */
export const PUBLISH_PREVIEW_LIMIT = 3

/**
 * Publishes the cron attempted and lost.
 *
 * Newest first: a stale failure matters less than one from last night. Unlike the upcoming list,
 * this has no cached equivalent elsewhere — the roster has no reason to care about failures.
 */
const fetchFailed = unstable_cache(
  async (agencyId: string): Promise<PostSummary[]> => {
    const supabase = createAdminSupabaseClient()
    const { data, error } = await supabase
      .from('posts')
      .select(UPCOMING_POST_COLUMNS)
      .eq('clients.agency_id', agencyId)
      .eq('status', 'failed')
      .order('scheduled_at', { ascending: false })
      .limit(PUBLISH_PREVIEW_LIMIT)

    if (error) {
      console.error('[dashboard] failed publishes query failed:', error.message)
      return []
    }
    // WHY as: the clients!inner join is a filter only; its column is never read.
    return (data ?? []) as unknown as PostSummary[]
  },
  ['dashboard-failed-publishes'],
  { revalidate: 60, tags: ['client-post-stats'] }
)

export const getCachedFailedPublishes = cache(fetchFailed)

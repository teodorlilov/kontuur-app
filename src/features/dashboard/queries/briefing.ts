import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { BRIEFING_COLUMNS } from '@/lib/queries/select-columns'
import type { DashboardBriefing } from '@/features/dashboard/types'

/**
 * Cache tag for the agency's intelligence briefing.
 *
 * Its own tag rather than one of the post/client ones: a briefing turns over weekly and is
 * written by exactly one action, so folding it into `client-post-stats` would throw away a
 * long-lived entry every time somebody approved a post.
 */
export const DASHBOARD_BRIEFING_TAG = 'dashboard-briefing'

/**
 * The agency's most recent intelligence briefing, or null before the first one is generated.
 *
 * Five-minute TTL because a briefing is weekly — the tag, busted by `generateBriefing`, is what
 * makes a freshly written one appear at once.
 */
const fetchBriefing = unstable_cache(
  async (agencyId: string): Promise<DashboardBriefing | null> => {
    const supabase = createAdminSupabaseClient()
    const { data, error } = await supabase
      .from('intelligence_briefings')
      .select(BRIEFING_COLUMNS)
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[dashboard] briefing query failed:', error.message)
      return null
    }
    return data as DashboardBriefing | null
  },
  ['dashboard-briefing'],
  { revalidate: 300, tags: [DASHBOARD_BRIEFING_TAG] }
)

export const getCachedBriefing = cache(fetchBriefing)

import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { BRIEFING_COLUMNS } from '@/lib/queries/select-columns'
import { briefingItemsSchema } from '@/ai/intelligence/schema'
import type { DashboardBriefing } from '@/features/dashboard/types'

/**
 * Cache tag for the weekly platform brief.
 *
 * Its own tag rather than one of the post/client ones: a brief turns over weekly and is
 * written by exactly one writer, so folding it into `client-post-stats` would throw away a
 * long-lived entry every time somebody approved a post.
 */
export const DASHBOARD_BRIEFING_TAG = 'dashboard-briefing'

/**
 * The most recent brief, or null before the first one is written.
 *
 * Not agency data: one row per week serves every dashboard, so there is nothing to scope by.
 * `items` comes back through the same schema that produced it — a `Json` column does not
 * narrow, and a row a future writer corrupted must render as "no brief", never as a 500.
 *
 * Five-minute TTL because a brief is weekly — the tag, busted by `writeWeeklyBriefing`, is what
 * makes a freshly written one appear at once. The key carries a version because the cached
 * VALUE changed shape in the 2026-09 rebuild, and an entry from the previous deploy would
 * otherwise be served until the TTL expired.
 */
const fetchBriefing = unstable_cache(
  async (): Promise<DashboardBriefing | null> => {
    const supabase = createAdminSupabaseClient()
    const { data, error } = await supabase
      .from('intelligence_briefings')
      .select(BRIEFING_COLUMNS)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[dashboard] briefing query failed:', error.message)
      return null
    }
    if (!data) return null

    const items = briefingItemsSchema.safeParse(data.items)
    if (!items.success) {
      console.error('[dashboard] briefing items malformed:', items.error.message)
      return null
    }
    return { week_start: data.week_start, items: items.data }
  },
  ['dashboard-briefing-v2'],
  { revalidate: 300, tags: [DASHBOARD_BRIEFING_TAG] }
)

export const getCachedBriefing = cache(fetchBriefing)

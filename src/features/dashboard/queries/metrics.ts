import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { SCHEDULED_STATUSES, type PendingRow } from '@/lib/queries/cache'
import { getWeekRange } from '@/utils/date-helpers'
import { hasLiveChannel, type RosterConnectionRow } from '@/features/clients/lib/roster'

/**
 * How many posts are due to go out this week.
 *
 * Returns null when the query fails. A failed count is not zero: returning 0 would present an
 * outage as a real figure, which is exactly what the card's "unknown" state exists to avoid.
 *
 * Keyed by agency, week and zone — all primitives, so the entry rolls over naturally at that
 * agency's week boundary rather than needing eviction.
 */
const fetchScheduledCount = unstable_cache(
  async (agencyId: string, weekStartISO: string, timeZone: string): Promise<number | null> => {
    const supabase = createAdminSupabaseClient()
    const { from, to } = getWeekRange(weekStartISO, timeZone)

    const { count, error } = await supabase
      .from('posts')
      .select('id, clients!inner(agency_id)', { count: 'exact', head: true })
      .eq('clients.agency_id', agencyId)
      .in('status', SCHEDULED_STATUSES)
      // Bounded at both ends: .gte alone counted every future post ever scheduled,
      // under a label that says "this week".
      .gte('scheduled_at', from)
      .lt('scheduled_at', to)

    if (error) {
      console.error('[dashboard] scheduled this week count failed:', error.message)
      return null
    }
    return count ?? 0
  },
  ['dashboard-scheduled-count'],
  { revalidate: 60, tags: ['client-post-stats'] }
)

export const getCachedScheduledThisWeek = cache(fetchScheduledCount)

/**
 * How many of the agency's clients have at least one social account linked.
 *
 * Counted over distinct client ids rather than rows, because a client with more than one
 * connection row (Instagram plus Canva) is still one connected client.
 */
const fetchConnectedCount = unstable_cache(
  async (agencyId: string): Promise<number> => {
    const supabase = createAdminSupabaseClient()
    const { data, error } = await supabase
      .from('social_connections')
      .select('client_id, platform, account_name, token_expires_at, clients!inner(agency_id)')
      .eq('clients.agency_id', agencyId)

    if (error) {
      console.error('[dashboard] connections query failed:', error.message)
      return 0
    }

    // Grouped per client, then judged by the roster's rule rather than a second one. This counted
    // rows whose token had lapsed — see `hasLiveChannel`.
    const byClient = new Map<string, RosterConnectionRow[]>()
    for (const row of (data ?? []) as Array<RosterConnectionRow & { client_id: string | null }>) {
      if (!row.client_id) continue
      byClient.set(row.client_id, [...(byClient.get(row.client_id) ?? []), row])
    }

    const now = new Date()
    let connected = 0
    for (const rows of byClient.values()) if (hasLiveChannel(rows, now)) connected += 1
    return connected
  },
  ['dashboard-connected-count'],
  { revalidate: 60, tags: ['agency-clients'] }
)

export const getCachedConnectedClientCount = cache(fetchConnectedCount)

/** Per-client pending tally plus the oldest waiting draft. */
export function summarisePending(rows: PendingRow[]): {
  clientPendingMap: Record<string, number>
  oldestPendingAt: string | null
} {
  const clientPendingMap: Record<string, number> = {}
  let oldestPendingAt: string | null = null

  for (const row of rows) {
    clientPendingMap[row.client_id] = (clientPendingMap[row.client_id] ?? 0) + 1
    if (!oldestPendingAt || row.created_at < oldestPendingAt) oldestPendingAt = row.created_at
  }

  return { clientPendingMap, oldestPendingAt }
}

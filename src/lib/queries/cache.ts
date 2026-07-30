import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { AGENCY_COLUMNS, CLIENT_CARD_COLUMNS, CLIENT_LIST_COLUMNS } from '@/lib/queries/select-columns'
import { toDateKey } from '@/utils/date-helpers'
import { DAYS_PER_WEEK } from '@/utils/constants'
import type { Database } from '@/types/database'

type Agency = Database['public']['Tables']['agencies']['Row']
type Client = Database['public']['Tables']['clients']['Row']

/**
 * Returns the full agency row for the given agencyId.
 * - unstable_cache: persists in Next.js Data Cache across requests (60s TTL, 'agencies' tag)
 * - React cache(): deduplicates within a single SSR request so layout + page share one result
 * Call revalidateTag('agencies') after any agency mutation to clear stale entries immediately.
 */
const _fetchAgency = unstable_cache(
  async (agencyId: string): Promise<Agency | null> => {
    const supabase = createAdminSupabaseClient()
    const { data } = await supabase
      .from('agencies')
      .select(AGENCY_COLUMNS)
      .eq('id', agencyId)
      .single()
    return data as Agency | null
  },
  ['agency'],
  { revalidate: 60, tags: ['agencies'] }
)

export const getCachedAgency = cache(_fetchAgency)

/**
 * Returns all clients for the given agencyId with commonly needed columns.
 * - unstable_cache: persists in Next.js Data Cache across requests (60s TTL, 'agency-clients' tag)
 * - React cache(): deduplicates within a single SSR request so layout + page share one result
 * Call revalidateTag('agency-clients') after any client mutation to clear stale entries immediately.
 *
 * Note: pages that require joined data (brand_profiles, contact_email) should
 * issue their own targeted queries in addition to calling this function.
 */
const _fetchAgencyClients = unstable_cache(
  async (
    agencyId: string
  ): Promise<
    Pick<Client, 'id' | 'name' | 'niche' | 'posts_per_week' | 'language' | 'created_at'>[]
  > => {
    const supabase = createAdminSupabaseClient()
    const { data } = await supabase
      .from('clients')
      .select(CLIENT_LIST_COLUMNS)
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: true })
    return (data ?? []) as Pick<
      Client,
      'id' | 'name' | 'niche' | 'posts_per_week' | 'language' | 'created_at'
    >[]
  },
  ['agency-clients'],
  { revalidate: 60, tags: ['agency-clients'] }
)

export const getCachedAgencyClients = cache(_fetchAgencyClients)

interface ClientCardRow {
  id: string
  name: string
  niche: string | null
  posts_per_week: number
  language: string
  created_at: string
  brand_profiles: { content_pillars: string | null } | null
}

/**
 * Returns all clients with joined brand_profiles for card grid display.
 * Call revalidateTag('agency-clients') after any client mutation.
 */
const _fetchClientCards = unstable_cache(
  async (agencyId: string): Promise<ClientCardRow[]> => {
    const supabase = createAdminSupabaseClient()
    const { data } = await supabase
      .from('clients')
      .select(CLIENT_CARD_COLUMNS)
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: true })
    return (data ?? []) as ClientCardRow[]
  },
  ['client-cards'],
  { revalidate: 60, tags: ['agency-clients'] }
)

export const getCachedClientCards = cache(_fetchClientCards)

export interface ClientPostStats {
  publishedCount: number
  totalCount: number
  lastGeneratedAt: string | null
}

/**
 * Returns post statistics per client for an agency via server-side SQL aggregation.
 * Call revalidateTag('client-post-stats') after post mutations.
 */
const _fetchClientPostStats = unstable_cache(
  async (agencyId: string): Promise<Record<string, ClientPostStats>> => {
    const supabase = createAdminSupabaseClient()
    const { data } = await supabase.rpc('client_post_stats', { p_agency_id: agencyId })

    const stats: Record<string, ClientPostStats> = {}
    for (const row of data ?? []) {
      stats[row.client_id] = {
        publishedCount: Number(row.published_count),
        totalCount: Number(row.total_count),
        lastGeneratedAt: row.last_generated_at,
      }
    }
    return stats
  },
  ['client-post-stats'],
  { revalidate: 60, tags: ['client-post-stats'] }
)

export const getCachedClientPostStats = cache(_fetchClientPostStats)

export interface PendingRow {
  client_id: string
  created_at: string
}

/**
 * Returns pending-review post rows for all clients of the given agency.
 * created_at is included so callers can report how long the queue has been waiting.
 * - unstable_cache: persists in Next.js Data Cache across requests (30s TTL, 'client-post-stats' tag)
 * - React cache(): deduplicates within a single SSR request so layout + page share one result
 * Keyed by agencyId so the cache key is a primitive — no array reference issues.
 */
const _fetchPendingRows = unstable_cache(
  async (agencyId: string): Promise<PendingRow[]> => {
    const supabase = createAdminSupabaseClient()
    const { data } = await supabase
      .from('posts')
      .select('client_id, created_at, clients!inner(agency_id)')
      .eq('status', 'pending_review')
      .eq('clients.agency_id', agencyId)
    return (data as PendingRow[] | null) ?? []
  },
  ['pending-rows'],
  { revalidate: 30, tags: ['client-post-stats'] }
)

export const getCachedPendingRows = cache(_fetchPendingRows)

/** Whether a given day of a client's week is published, scheduled, or still open. */
export type DayState = 'published' | 'scheduled' | 'open'


/** Statuses that mean a slot is filled but has not gone out yet. */
const SCHEDULED_STATUSES = new Set(['approved', 'scheduled', 'publishing'])

interface CoverageRow {
  client_id: string
  status: string
  scheduled_at: string | null
  published_at: string | null
}

/**
 * Returns each client's week as seven day states, Monday first.
 * weekStartISO must be a 'YYYY-MM-DD' Monday (see getMondayISO) — it is part of
 * the cache key, so the entry rolls over naturally at the week boundary.
 * Call revalidateTag('client-post-stats') after post mutations.
 */
const _fetchClientWeekCoverage = unstable_cache(
  async (agencyId: string, weekStartISO: string): Promise<Record<string, DayState[]>> => {
    const supabase = createAdminSupabaseClient()
    const weekStart = new Date(`${weekStartISO}T00:00:00`)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + DAYS_PER_WEEK)

    const from = weekStart.toISOString()
    const to = weekEnd.toISOString()

    // A post counts for this week by when it is due, or by when it actually went
    // out (posts published on demand carry no scheduled_at).
    const { data, error } = await supabase
      .from('posts')
      .select('client_id, status, scheduled_at, published_at, clients!inner(agency_id)')
      .eq('clients.agency_id', agencyId)
      .or(
        `and(scheduled_at.gte.${from},scheduled_at.lt.${to}),` +
          `and(published_at.gte.${from},published_at.lt.${to})`
      )

    // Without this the dashboard would quietly render every client's week as
    // empty, which reads as real data rather than as a failure.
    if (error) {
      console.error('[cache] client week coverage query failed:', error.message)
      return {}
    }

    const dayKeys = Array.from({ length: DAYS_PER_WEEK }, (_, index) => {
      const day = new Date(weekStart)
      day.setDate(day.getDate() + index)
      return toDateKey(day)
    })

    const coverage: Record<string, DayState[]> = {}

    for (const row of (data as CoverageRow[] | null) ?? []) {
      const stamp = row.scheduled_at ?? row.published_at
      if (!stamp) continue

      const dayIndex = dayKeys.indexOf(toDateKey(new Date(stamp)))
      if (dayIndex === -1) continue

      const week = (coverage[row.client_id] ??= Array<DayState>(DAYS_PER_WEEK).fill('open'))

      // Published wins the slot — it is the stronger signal for the day.
      if (row.status === 'published') {
        week[dayIndex] = 'published'
      } else if (SCHEDULED_STATUSES.has(row.status) && week[dayIndex] === 'open') {
        week[dayIndex] = 'scheduled'
      }
    }

    return coverage
  },
  ['client-week-coverage'],
  { revalidate: 60, tags: ['client-post-stats'] }
)

export const getCachedClientWeekCoverage = cache(_fetchClientWeekCoverage)


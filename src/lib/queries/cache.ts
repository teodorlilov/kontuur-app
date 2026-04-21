import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { AGENCY_COLUMNS, CLIENT_CARD_COLUMNS, CLIENT_LIST_COLUMNS } from '@/lib/queries/select-columns'
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
 * Returns post statistics per client for an agency.
 * Call revalidateTag('client-post-stats') after post mutations.
 */
const _fetchClientPostStats = unstable_cache(
  async (agencyId: string): Promise<Record<string, ClientPostStats>> => {
    const supabase = createAdminSupabaseClient()
    const { data } = await supabase
      .from('posts')
      .select('client_id, status, created_at, clients!inner(agency_id)')
      .eq('clients.agency_id', agencyId)

    const stats: Record<string, ClientPostStats> = {}
    for (const row of (data ?? []) as { client_id: string; status: string; created_at: string }[]) {
      const entry = (stats[row.client_id] ??= { publishedCount: 0, totalCount: 0, lastGeneratedAt: null })
      entry.totalCount++
      if (row.status === 'published') entry.publishedCount++
      if (!entry.lastGeneratedAt || row.created_at > entry.lastGeneratedAt) {
        entry.lastGeneratedAt = row.created_at
      }
    }
    return stats
  },
  ['client-post-stats'],
  { revalidate: 60, tags: ['client-post-stats'] }
)

export const getCachedClientPostStats = cache(_fetchClientPostStats)

/**
 * Returns pending-review post rows (client_id only) for all clients of the given agency.
 * - React cache(): deduplicates within a single SSR request so layout + page share one result
 * Keyed by agencyId so the cache key is a primitive — no array reference issues.
 */
export const getCachedPendingRows = cache(async (agencyId: string): Promise<{ client_id: string }[]> => {
  const supabase = createAdminSupabaseClient()
  const { data } = await supabase
    .from('posts')
    .select('client_id, clients!inner(agency_id)')
    .eq('status', 'pending_review')
    .eq('clients.agency_id', agencyId)
  return (data as { client_id: string }[] | null) ?? []
})

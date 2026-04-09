import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AGENCY_COLUMNS, CLIENT_LIST_COLUMNS } from '@/lib/queries/select-columns'
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
    const supabase = await createServerSupabaseClient()
    const { data } = await supabase
      .from('agencies')
      .select(AGENCY_COLUMNS)
      .eq('id', agencyId)
      .single()
    return (data as Agency | null)
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
  async (agencyId: string): Promise<Pick<Client, 'id' | 'name' | 'niche' | 'posts_per_week' | 'language' | 'created_at'>[]> => {
    const supabase = await createServerSupabaseClient()
    const { data } = await supabase
      .from('clients')
      .select(CLIENT_LIST_COLUMNS)
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: true })
    return (data ?? []) as Pick<Client, 'id' | 'name' | 'niche' | 'posts_per_week' | 'language' | 'created_at'>[]
  },
  ['agency-clients'],
  { revalidate: 60, tags: ['agency-clients'] }
)

export const getCachedAgencyClients = cache(_fetchAgencyClients)

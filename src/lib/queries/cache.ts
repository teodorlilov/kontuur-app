import { cache } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type Agency = Database['public']['Tables']['agencies']['Row']
type Client = Database['public']['Tables']['clients']['Row']

/**
 * Returns the full agency row for the given agencyId.
 * Memoized via React cache() — safe to call from layout and any child
 * page in the same request without duplicate DB round-trips.
 */
export const getCachedAgency = cache(async (agencyId: string): Promise<Agency | null> => {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('agencies')
    .select('id, name, plan, mode, agency_logo, stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at, plan_client_limit, timezone, created_at')
    .eq('id', agencyId)
    .single()
  return (data as Agency | null)
})

/**
 * Returns all clients for the given agencyId with commonly needed columns.
 * Memoized via React cache() — deduplicates across layout and child pages
 * that each previously queried the clients table independently.
 *
 * Note: pages that require joined data (brand_profiles, contact_email) should
 * issue their own targeted queries in addition to calling this function.
 */
export const getCachedAgencyClients = cache(
  async (agencyId: string): Promise<Pick<Client, 'id' | 'name' | 'niche' | 'posts_per_week' | 'language' | 'created_at'>[]> => {
    const supabase = await createServerSupabaseClient()
    const { data } = await supabase
      .from('clients')
      .select('id, name, niche, posts_per_week, language, created_at')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: true })
    return (data ?? []) as Pick<Client, 'id' | 'name' | 'niche' | 'posts_per_week' | 'language' | 'created_at'>[]
  }
)

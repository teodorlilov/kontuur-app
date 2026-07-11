import type { SupabaseClient } from '@supabase/supabase-js'
import type { BrandTokens } from '@/lib/scene-graph'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

// brand_kits is not in the generated Database types yet (new migration); cast the admin client until
// `supabase gen types` regenerates them, then drop the cast. Same pattern as post_visuals.
function adminClient(): SupabaseClient {
  return createAdminSupabaseClient() as unknown as SupabaseClient
}

export type BrandKitRow = {
  id: string
  client_id: string
  tokens: BrandTokens
  version: number
  source_kind: string
}

const KIT_COLUMNS = 'id, client_id, tokens, version, source_kind'

/**
 * Read a client's brand kit, scoped to the caller's agency. Access is app-level (no RLS): the client
 * must belong to `agencyId` or this returns null — a client from another agency can never leak a kit.
 */
export async function getBrandKitForClient(clientId: string, agencyId: string): Promise<BrandKitRow | null> {
  const supabase = adminClient()
  const { data: owned } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('agency_id', agencyId)
    .maybeSingle()
  if (!owned) return null

  const { data } = await supabase.from('brand_kits').select(KIT_COLUMNS).eq('client_id', clientId).maybeSingle()
  return (data as BrandKitRow | null) ?? null
}

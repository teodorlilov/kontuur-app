import type { BrandTokens } from '@/lib/scene-graph'
import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import { createUntypedAdminClient } from '@/lib/supabase/admin'

export type BrandKitRow = {
  id: string
  client_id: string
  tokens: BrandTokens
  version: number
  source_kind: string
  /** The art-direction brief (subjects/motifs/mood) — the input to Phase 4 image prompts. Null on kits
   *  extracted before the brief was persisted, or on the default kit. */
  brief: BrandBrief | null
}

const KIT_COLUMNS = 'id, client_id, tokens, version, source_kind, brief'

/**
 * Read a client's brand kit, scoped to the caller's agency. Access is app-level (no RLS): the client
 * must belong to `agencyId` or this returns null — a client from another agency can never leak a kit.
 */
export async function getBrandKitForClient(clientId: string, agencyId: string): Promise<BrandKitRow | null> {
  const supabase = createUntypedAdminClient()
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

/**
 * The client's default feed system (slug + id), falling back to editorial. Shared by the visuals
 * generate + GET endpoints so the slug is resolved one way. No agency check — callers verify the post
 * ownership first.
 */
export async function getClientFeedSystem(clientId: string): Promise<{ slug: string; id: string | null }> {
  const supabase = createUntypedAdminClient()
  const { data: sel } = await supabase
    .from('client_feed_systems')
    .select('feed_system_id')
    .eq('client_id', clientId)
    .eq('is_default', true)
    .maybeSingle()
  const id = (sel as { feed_system_id?: string } | null)?.feed_system_id ?? null
  if (!id) return { slug: 'editorial', id: null }
  const { data: fs } = await supabase.from('feed_systems').select('slug').eq('id', id).maybeSingle()
  return { slug: (fs as { slug?: string } | null)?.slug ?? 'editorial', id }
}

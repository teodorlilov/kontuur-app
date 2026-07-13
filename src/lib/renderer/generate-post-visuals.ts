import type { SupabaseClient } from '@supabase/supabase-js'
import { getBrandKitForClient, getClientFeedSystem } from '@/lib/brand-kit/queries'
import { composeSlides } from '@/lib/renderer/compose'
import { DEFAULT_RATIO } from '@/lib/renderer/layout/anchor'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { CarouselSlide } from '@/types/api'

function adminClient(): SupabaseClient {
  return createAdminSupabaseClient() as unknown as SupabaseClient
}

/**
 * Compose a post's carousel copy into per-slide scene graphs, store them in `post_visuals`, and mark the
 * post `visuals_status = 'ready'`. The single implementation behind every trigger — the generation flows
 * (autonomous cron + the manual wizard) call it so posts arrive designed, and the on-demand review
 * endpoint calls it to (re)generate. Phase 4 imagery slots in before the upsert. Throws on failure — the
 * caller decides how to surface it (the generators treat it as best-effort; the endpoint marks 'failed').
 */
export async function composePostVisuals(params: {
  postId: string
  clientId: string
  agencyId: string
  slides: CarouselSlide[]
}): Promise<void> {
  const { postId, clientId, agencyId, slides } = params
  if (slides.length === 0) return

  const db = adminClient()
  const [kit, feedSystem, { data: clientRow }] = await Promise.all([
    getBrandKitForClient(clientId, agencyId),
    getClientFeedSystem(clientId),
    db.from('clients').select('name').eq('id', clientId).single(),
  ])
  const kicker = (clientRow as { name?: string } | null)?.name ?? ''

  const compositions = composeSlides(slides, { feedSystemSlug: feedSystem.slug, ratio: DEFAULT_RATIO, postId, kicker })
  const rows = compositions.map((composition, slideIndex) => ({
    post_id: postId,
    slide_index: slideIndex,
    composition_json: composition as unknown,
    brand_kit_version: kit?.version ?? 1,
    feed_system_id: feedSystem.id,
    updated_at: new Date().toISOString(),
  }))

  await db.from('post_visuals').delete().eq('post_id', postId)
  const { error } = await db.from('post_visuals').insert(rows)
  if (error) throw new Error(error.message)
  await db.from('posts').update({ visuals_status: 'ready' }).eq('id', postId)
}

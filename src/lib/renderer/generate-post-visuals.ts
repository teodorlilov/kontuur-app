import type { SupabaseClient } from '@supabase/supabase-js'
import { getBrandKitForClient, getClientFeedSystem } from '@/lib/brand-kit/queries'
import { composePostSlides } from '@/lib/renderer/compose'
import { DEFAULT_RATIO } from '@/lib/renderer/layout/anchor'
import { fillPlates } from '@/lib/images/generate-plates'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { CarouselSlide } from '@/types/api'

function adminClient(): SupabaseClient {
  return createAdminSupabaseClient() as unknown as SupabaseClient
}

/**
 * Compose a post's carousel copy into per-slide scene graphs, store them in `post_visuals`, and mark the
 * post `visuals_status = 'ready'`. The single implementation behind every trigger — the generation flows
 * (autonomous cron + the manual wizard) call it so posts arrive designed, and the on-demand review
 * endpoint calls it to (re)generate.
 *
 * `withImagery` gates the paid fal.ai plate generation: only the operator's on-demand "Generate visuals"
 * click passes it, so nothing auto-spends (cron/wizard stay copy-only, a documented Phase 4 limitation).
 * Imagery is fail-soft — a failure leaves the token gradient, so this never throws on an image problem.
 * Throws only on the DB write — the caller surfaces it (generators best-effort, endpoint marks 'failed').
 */
export async function composePostVisuals(params: {
  postId: string
  clientId: string
  agencyId: string
  slides: CarouselSlide[]
  withImagery?: boolean
}): Promise<void> {
  const { postId, clientId, agencyId, slides, withImagery = false } = params
  if (slides.length === 0) return

  const db = adminClient()
  const [kit, feedSystem, { data: clientRow }] = await Promise.all([
    getBrandKitForClient(clientId, agencyId),
    getClientFeedSystem(clientId),
    db.from('clients').select('name').eq('id', clientId).single(),
  ])
  const clientName = (clientRow as { name?: string } | null)?.name ?? ''

  let compositions = composePostSlides(slides, { feedSystemSlug: feedSystem.slug, postId, clientName })
  if (withImagery) {
    compositions = await fillPlates(compositions, slides, {
      clientId,
      brief: kit?.brief ?? null,
      colors: (kit?.tokens ?? DEFAULT_TOKENS).color,
      feedSystemSlug: feedSystem.slug,
      ratio: DEFAULT_RATIO,
    })
  }

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

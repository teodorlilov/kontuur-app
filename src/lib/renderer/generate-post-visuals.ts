import { getBrandKitForClient, getClientFeedSystem } from '@/lib/brand-kit/queries'
import { composePostSlides } from '@/lib/renderer/compose'
import { feedSystemTokens } from '@/lib/renderer/feed-system-compositions'
import { DEFAULT_RATIO } from '@/lib/renderer/layout/anchor'
import { fillImagery, type FillImageryContext } from '@/lib/images/generate-plates'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'
import { createUntypedAdminClient } from '@/lib/supabase/admin'
import type { CarouselSlide } from '@/types/api'

/** Load the shared compose context (kit + feed system + client name) once — used by both the stored
 *  compose and the wizard preview so the two paths agree. */
async function loadComposeContext(clientId: string, agencyId: string) {
  const db = createUntypedAdminClient()
  const [kit, feedSystem, { data: clientRow }] = await Promise.all([
    getBrandKitForClient(clientId, agencyId),
    getClientFeedSystem(clientId),
    db.from('clients').select('name').eq('id', clientId).single(),
  ])
  return { db, kit, feedSystem, clientName: (clientRow as { name?: string } | null)?.name ?? '' }
}

/** The fal-imagery context for a client, from its kit. */
function imageryContext(clientId: string, kit: Awaited<ReturnType<typeof getBrandKitForClient>>, feedSystemSlug: string | null): FillImageryContext {
  return {
    clientId,
    brief: kit?.brief ?? null,
    colors: (kit?.tokens ?? DEFAULT_TOKENS).color,
    feedSystemSlug,
    ratio: DEFAULT_RATIO,
  }
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
  /** Autonomously raster the composed slides to `post_images` (headless server render, Phase 6). Off by
   *  default; the cron opts in via `ENABLE_SERVER_RENDER`, so a post with no operator still publishes. */
  renderImages?: boolean
}): Promise<void> {
  const { postId, clientId, agencyId, slides, withImagery = false, renderImages = false } = params
  if (slides.length === 0) return

  const { db, kit, feedSystem, clientName } = await loadComposeContext(clientId, agencyId)

  let compositions = composePostSlides(slides, { feedSystemSlug: feedSystem.slug, postId, clientName })
  if (withImagery) {
    compositions = await fillImagery(compositions, slides, imageryContext(clientId, kit, feedSystem.slug))
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

  // Autonomous publish render (Phase 6) — lazy-loaded so the puppeteer path never touches the common
  // flows. Fail-soft: a render failure leaves the post image-less, exactly as before.
  if (renderImages) {
    try {
      const { renderAndUploadPostImages } = await import('./server-export')
      const tokens = feedSystemTokens(feedSystem.slug, kit?.tokens ?? DEFAULT_TOKENS)
      await renderAndUploadPostImages({
        postId,
        clientId,
        slides: compositions.map((composition, slideIndex) => ({ slideIndex, composition })),
        tokens,
      })
    } catch (e) {
      console.error('[compose] server render failed for', postId, e)
    }
  }
}

/**
 * Generate the plate images for a post's slides WITHOUT storing anything — used by the manual generation
 * wizard so the pre-save preview shows real photos, not just the copy. The images are cached in
 * `brand_image_bank` by the deterministic slide-copy hash, so when the operator approves and the post is
 * saved, `composePostVisuals({ withImagery: true })` hits that cache and reuses them — no double spend.
 * Returns slide index → plate URL (only plate-bearing slides get one); fail-soft, so failures are absent.
 */
export async function generatePostPlates(params: {
  clientId: string
  agencyId: string
  slides: CarouselSlide[]
}): Promise<Record<number, string>> {
  const { clientId, agencyId, slides } = params
  if (slides.length === 0) return {}

  const { kit, feedSystem, clientName } = await loadComposeContext(clientId, agencyId)
  const compositions = composePostSlides(slides, { feedSystemSlug: feedSystem.slug, postId: 'preview', clientName })
  const filled = await fillImagery(compositions, slides, imageryContext(clientId, kit, feedSystem.slug))

  const plates: Record<number, string> = {}
  filled.forEach((composition, i) => {
    const src = composition.layers.find((l): l is typeof l & { src: string } => l.type === 'plate' && Boolean((l as { src?: string }).src))?.src
    if (src) plates[i] = src
  })
  return plates
}

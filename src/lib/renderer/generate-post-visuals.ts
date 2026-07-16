import { getBrandKitForClient, getClientFeedSystem } from '@/lib/brand-kit/queries'
import { clampArtDirection } from '@/lib/brand-kit/art-direction'
import { composePostSlides } from '@/lib/renderer/compose'
import { resolveArtDirection } from '@/lib/renderer/art-direction'
import { feedSystemTokens } from '@/lib/renderer/feed-system-compositions'
import { DEFAULT_RATIO } from '@/lib/renderer/layout/anchor'
import { fillImagery, type FillImageryContext } from '@/lib/images/generate-plates'
import { DEFAULT_TOKENS, lit, type Composition, type Treatment } from '@/lib/scene-graph'
import { createUntypedAdminClient } from '@/lib/supabase/admin'
import type { CarouselSlide, PostSlide } from '@/types/api'

/** Override every full-bleed plate's grade with the art direction's treatment (cutouts stay ungraded). */
function withTreatment(composition: Composition, treatment: Treatment): Composition {
  return {
    ...composition,
    layers: composition.layers.map((l) =>
      l.type === 'plate' && !l.cutout ? { ...l, treatment: lit(treatment) } : l
    ),
  }
}

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

/** The fal-imagery context for a client, from its kit + the resolved art-direction conditioning phrase. */
function imageryContext(
  clientId: string,
  kit: Awaited<ReturnType<typeof getBrandKitForClient>>,
  feedSystemSlug: string | null,
  conditioning?: string
): FillImageryContext {
  return {
    clientId,
    brief: kit?.brief ?? null,
    colors: (kit?.tokens ?? DEFAULT_TOKENS).color,
    feedSystemSlug,
    ratio: DEFAULT_RATIO,
    conditioning,
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

  // The operator's chosen feed system is the style; the persisted art direction (when present) only
  // *conditions* generation — the plate photo grade + the design-prompt phrasing. Backward-compatible.
  const direction = kit?.art_direction ? resolveArtDirection(clampArtDirection(kit.art_direction)) : null
  const slug = feedSystem.slug

  let compositions = composePostSlides(slides, { feedSystemSlug: slug, postId, clientName })
  if (direction) compositions = compositions.map((c) => withTreatment(c, direction.treatment))
  if (withImagery) {
    compositions = await fillImagery(compositions, slides, imageryContext(clientId, kit, slug, direction?.conditioning))
  }

  const rows = compositions.map((composition, slideIndex) => ({
    post_id: postId,
    slide_index: slideIndex,
    composition_json: composition as unknown,
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
 * Compose + fill a post's slides WITHOUT storing anything — the manual generation wizard's pre-save
 * preview. Returns the **fully imagery-filled compositions** (photo plates AND generated vector marks), so
 * a vector/illustrative style shows its marks and a photo style shows its photos — not just plates. Runs
 * through the same art-direction-driven compose + `fillImagery` as the stored path, and the results are
 * cached by slide-copy hash, so approve → `composePostVisuals({ withImagery: true })` reuses them (no
 * double spend). Fail-soft — a slide with no imagery keeps its gradient/colour ground.
 */
export async function generatePreviewVisuals(params: {
  clientId: string
  agencyId: string
  slides: CarouselSlide[]
}): Promise<PostSlide[]> {
  const { clientId, agencyId, slides } = params
  if (slides.length === 0) return []

  const { kit, feedSystem, clientName } = await loadComposeContext(clientId, agencyId)
  const direction = kit?.art_direction ? resolveArtDirection(clampArtDirection(kit.art_direction)) : null
  const slug = feedSystem.slug
  let compositions = composePostSlides(slides, { feedSystemSlug: slug, postId: 'preview', clientName })
  if (direction) compositions = compositions.map((c) => withTreatment(c, direction.treatment))
  const filled = await fillImagery(compositions, slides, imageryContext(clientId, kit, slug, direction?.conditioning))
  return filled.map((composition, slideIndex) => ({ slideIndex, composition }))
}

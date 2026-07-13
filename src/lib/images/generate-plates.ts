import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import type { AspectRatio } from '@/lib/renderer/layout/anchor'
import type { BrandTokens, Composition } from '@/lib/scene-graph'
import type { CarouselSlide } from '@/types/api'
import { seedFromClient } from './hash'
import type { PlateRole } from './prompt'

/**
 * Fill each slide's background plate with generated imagery (Phase 4). Runs after `composePostSlides`,
 * inside the on-demand generate job, so it only spends when an operator asks. Every step is fail-soft:
 * a slide with no plate layer (a solid-colour design like quiet-grid, or the editorial list/quote) is
 * left untouched, and any generation/storage failure leaves the plate's gradient — the carousel always
 * renders. The cover generates a unique image; interior slides reuse the per-brand bank via the cache.
 */

/** Cover is the first slide; the rest are interior (textural) plates. */
export function plateRole(index: number): PlateRole {
  return index === 0 ? 'cover' : 'interior'
}

/** Only some compositions carry a plate (cover/statement/cta in editorial, cover in bold-blocks); the
 *  rest are solid designs that take no imagery. */
export function hasPlateLayer(composition: Composition): boolean {
  return composition.layers.some((l) => l.type === 'plate')
}

function withPlateSrc(composition: Composition, src: string): Composition {
  return {
    ...composition,
    layers: composition.layers.map((l) => (l.type === 'plate' ? { ...l, src } : l)),
  }
}

export type FillPlatesContext = {
  clientId: string
  brief: BrandBrief | null
  colors: BrandTokens['color']
  feedSystemSlug: string | null
  ratio: AspectRatio
}

/** Return the compositions with plate `src` filled where imagery applies. Slides map 1:1 to compositions. */
export async function fillPlates(
  compositions: Composition[],
  slides: CarouselSlide[],
  ctx: FillPlatesContext
): Promise<Composition[]> {
  const seed = seedFromClient(ctx.clientId)
  // Lazy-load the paid provider chain (fal + Claude scene) — so copy-only paths and the pure helpers
  // above never pull the fal SDK or the import-time-throwing AI client.
  const { resolvePlate } = await import('./bank')
  return Promise.all(
    compositions.map(async (composition, index) => {
      const slide = slides[index]
      if (!slide || !hasPlateLayer(composition)) return composition
      try {
        const url = await resolvePlate({
          clientId: ctx.clientId,
          role: plateRole(index),
          slide: { headline: slide.headline, body: slide.body },
          brief: ctx.brief,
          colors: ctx.colors,
          feedSystemSlug: ctx.feedSystemSlug,
          ratio: ctx.ratio,
          seed,
        })
        return url ? withPlateSrc(composition, url) : composition
      } catch (err) {
        console.error(`[images/generate-plates] slide ${index} failed:`, err)
        return composition
      }
    })
  )
}

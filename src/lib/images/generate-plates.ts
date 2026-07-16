import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import type { AspectRatio } from '@/lib/renderer/layout/anchor'
import type { BrandTokens, Composition, PlateLayer } from '@/lib/scene-graph'
import { getStyle } from '@/lib/renderer/styles'
import { slideRole, withPlateSrc, type SlideRole } from '@/lib/renderer/compose'
import type { CarouselSlide } from '@/types/api'
import type { PlateRole } from './prompt'

/**
 * Fill each slide's background plate with a generated **design** (the capable design model), running after
 * `composePostSlides` inside the on-demand generate job so it only spends when an operator asks. Every step
 * is fail-soft: a compositor-only style (`quiet-grid`, no plate) is left untouched, and any generation or
 * storage failure leaves the plate's gradient — the carousel always renders. The cover generates a striking
 * hero; interior slides continue the same visual world; all are banked + reused per brand.
 */

/** The design-prompt emphasis for a slide's carousel role: the cover is the hero; content + CTA are
 *  supporting/interior. Derived from the shared `slideRole` so layout and imagery never disagree. */
export function plateRole(role: SlideRole): PlateRole {
  return role === 'cover' ? 'cover' : 'interior'
}

/** The composition's full-bleed design plate, if any. Generative styles carry one; `quiet-grid`'s colour
 *  ground is a shape, not a plate, so it returns undefined (no imagery, no spend). */
export function plateLayer(composition: Composition): PlateLayer | undefined {
  return composition.layers.find((l): l is PlateLayer => l.type === 'plate')
}

/** Whether a composition takes a generated design (generative styles) or is a solid colour ground. */
export function hasPlateLayer(composition: Composition): boolean {
  return plateLayer(composition) !== undefined
}

export type FillImageryContext = {
  clientId: string
  brief: BrandBrief | null
  colors: BrandTokens['color']
  feedSystemSlug: string | null
  ratio: AspectRatio
  /** The art-direction conditioning phrase folded into the design prompt (formality / density / personality). */
  conditioning?: string
}

/**
 * Fill each slide's design plate from the client's style + brand. A generative style's plate → a design-model
 * render via `resolveDesign`, conditioned on the brand's reference images (consistency) and a carousel-aware
 * per-slide scene (relevancy); a compositor-only style → untouched (no spend). Slides map 1:1 to compositions;
 * every step is fail-soft, so a failure leaves the token gradient.
 */
export async function fillImagery(
  compositions: Composition[],
  slides: CarouselSlide[],
  ctx: FillImageryContext
): Promise<Composition[]> {
  const style = getStyle(ctx.feedSystemSlug)
  if (!style.generative) return compositions // quiet-grid: clean colour ground, no model call

  // Lazy-load the paid provider chain (fal + Claude scene) — so copy-only paths and the pure helpers above
  // never pull the fal SDK or the import-time-throwing AI client.
  const { resolveDesign, getBrandReferenceImages } = await import('./bank')
  const { composeCarouselScenes } = await import('./scene')

  // One reference-image fetch + one carousel-aware scene plan for the whole post (consistency + relevancy).
  const [references, scenes] = await Promise.all([
    getBrandReferenceImages(ctx.clientId),
    composeCarouselScenes({ slides: slides.map((s) => ({ headline: s.headline, body: s.body })), brief: ctx.brief }),
  ])

  return Promise.all(
    compositions.map(async (composition, index) => {
      const slide = slides[index]
      if (!slide) return composition
      const plate = plateLayer(composition)
      if (!plate) return composition
      try {
        const url = await resolveDesign({
          clientId: ctx.clientId,
          role: plateRole(slideRole(slide, index, slides.length)),
          slide: { headline: slide.headline, body: slide.body },
          brief: ctx.brief,
          colors: ctx.colors,
          feedSystemSlug: ctx.feedSystemSlug,
          ratio: ctx.ratio,
          scaffold: style.scaffold,
          negativeSpace: style.textZone,
          conditioning: ctx.conditioning,
          scene: scenes[index] ?? null,
          referenceImageUrls: references,
        })
        return url ? withPlateSrc(composition, url) : composition
      } catch (err) {
        console.error(`[images/generate-plates] design slide ${index} failed:`, err)
        return composition
      }
    })
  )
}

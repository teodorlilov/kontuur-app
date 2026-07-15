import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import type { AspectRatio } from '@/lib/renderer/layout/anchor'
import type { BrandTokens, Composition, MarkLayer, PlateLayer } from '@/lib/scene-graph'
import { getStyle } from '@/lib/renderer/styles'
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

/** The composition's plate layer, if any — its `cutout` flag decides whether imagery is a full-bleed
 *  photo or a background-removed subject. The single plate-finder the module (and its tests) share. */
export function plateLayer(composition: Composition): PlateLayer | undefined {
  return composition.layers.find((l): l is PlateLayer => l.type === 'plate')
}

/** Only some compositions carry a plate (cover/statement/cta in editorial, cover/statement in bold-blocks);
 *  the rest are solid designs that take no imagery. */
export function hasPlateLayer(composition: Composition): boolean {
  return plateLayer(composition) !== undefined
}

/** The composition's generated-vector mark layer, if any — a `MarkLayer` the imagery layer fills with a
 *  Recraft brand vector (the illustrative archetypes). Static/operator marks (`source` absent) are skipped. */
export function generatedMarkLayer(composition: Composition): MarkLayer | undefined {
  return composition.layers.find((l): l is MarkLayer => l.type === 'mark' && l.source === 'generated')
}

function withPlateSrc(composition: Composition, src: string): Composition {
  return {
    ...composition,
    layers: composition.layers.map((l) => (l.type === 'plate' ? { ...l, src } : l)),
  }
}

function withMarkSvg(composition: Composition, layerId: string, svg: string): Composition {
  return {
    ...composition,
    layers: composition.layers.map((l) => (l.id === layerId && l.type === 'mark' ? { ...l, svg } : l)),
  }
}

/** The motif for a slide's generated vector — cycles the brief's motifs so different vector slides get
 *  different marks, all banked + reused per brand. Falls back to an abstract mark when the brief has none. */
function motifForSlide(brief: BrandBrief | null, index: number): string {
  const motifs = (brief?.motifs ?? []).map((m) => m.trim()).filter(Boolean)
  return motifs.length > 0 ? motifs[index % motifs.length]! : 'an abstract geometric brand mark'
}

export type FillImageryContext = {
  clientId: string
  brief: BrandBrief | null
  colors: BrandTokens['color']
  feedSystemSlug: string | null
  ratio: AspectRatio
}

/**
 * Fill each slide's imagery from the client's style, routed by what the archetype asks for: a `plate`
 * layer → a Flux photo (or a background-removed cutout) via `resolvePlate`; a `'generated'` `MarkLayer` →
 * a Recraft brand vector via `resolveVector`; a solid design → untouched (no spend). The style's
 * `imageModel` supplies the fal model id per kind (undefined → provider default). Slides map 1:1 to
 * compositions; every step is fail-soft, so a failure leaves the token gradient / empty mark.
 */
export async function fillImagery(
  compositions: Composition[],
  slides: CarouselSlide[],
  ctx: FillImageryContext
): Promise<Composition[]> {
  const seed = seedFromClient(ctx.clientId)
  const style = getStyle(ctx.feedSystemSlug)
  // Lazy-load the paid provider chain (fal + Claude scene) — so copy-only paths and the pure helpers
  // above never pull the fal SDK or the import-time-throwing AI client.
  const { resolvePlate, resolveVector } = await import('./bank')
  return Promise.all(
    compositions.map(async (composition, index) => {
      const slide = slides[index]
      if (!slide) return composition
      const plate = plateLayer(composition)
      if (plate) {
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
            cutout: Boolean(plate.cutout),
            model: style.imageModel.photo,
          })
          return url ? withPlateSrc(composition, url) : composition
        } catch (err) {
          console.error(`[images/generate-plates] plate slide ${index} failed:`, err)
          return composition
        }
      }
      const mark = generatedMarkLayer(composition)
      if (mark) {
        try {
          const svg = await resolveVector({
            clientId: ctx.clientId,
            motif: motifForSlide(ctx.brief, index),
            colors: ctx.colors,
            feedSystemSlug: ctx.feedSystemSlug,
            model: style.imageModel.vector,
          })
          return svg ? withMarkSvg(composition, mark.id, svg) : composition
        } catch (err) {
          console.error(`[images/generate-plates] vector slide ${index} failed:`, err)
          return composition
        }
      }
      return composition
    })
  )
}

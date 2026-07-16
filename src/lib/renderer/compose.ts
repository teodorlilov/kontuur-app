import type { Composition, Layer, TextSlot } from '@/lib/scene-graph'
import type { CarouselSlide } from '@/types/api'
import { DEFAULT_RATIO, RATIO_SIZES, resolveComposition, type AspectRatio } from './layout/anchor'
import { getArchetype, type Archetype } from './archetypes'
import { getStyle, type Style } from './styles'

/**
 * djb2 string hash → a stable per-post seed. Browser-safe (no `node:crypto`), because compose runs
 * client-side in the wizard/approval preview as well as server-side. Seeds the archetype sampling so a
 * post's interior layouts vary yet stay deterministic (same post → same design on every surface).
 */
function hashSeed(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h
}

/** The style's archetypes of a given kind, in declared order (skips ids that don't resolve). */
function pool(style: Style, kind: Archetype['kind']): Archetype[] {
  return style.archetypes.map(getArchetype).filter((a): a is Archetype => Boolean(a) && a!.kind === kind)
}

/** Any resolvable archetype for the style — the last-resort fallback so a slide always composes. */
function fallbackArchetype(style: Style): Archetype {
  const first = style.archetypes.map(getArchetype).find((a): a is Archetype => Boolean(a))
  return first ?? getArchetype('editorial-cover')!
}

/**
 * Pick the archetype for a slide: the style's **opener** for the cover (slide 0 or `slide_role: 'cover'`),
 * its **closer** for the CTA (last slide or `slide_role: 'cta'`), and a **content** archetype otherwise —
 * sampled from the pool by `(seed + index)`, so interior layouts vary across a carousel and differ between
 * posts (the seed) while staying deterministic for a given post. Replaces the old fixed role cycle.
 */
export function archetypeForSlide(style: Style, slide: CarouselSlide, index: number, total: number, seed: number): Archetype {
  if (slide.slide_role === 'cover' || index === 0) return pool(style, 'opener')[0] ?? fallbackArchetype(style)
  if (slide.slide_role === 'cta' || (total > 1 && index === total - 1)) return pool(style, 'closer')[0] ?? fallbackArchetype(style)
  const content = pool(style, 'content')
  if (content.length === 0) return fallbackArchetype(style)
  return content[(seed + index - 1) % content.length]!
}

/** Set every plate layer's `src` to a generated image; absent `src` → unchanged (the gradient plate).
 *  The one shared implementation for the preview grid, the wizard slides, and the imagery filler. */
export function withPlateSrc(composition: Composition, src: string | undefined): Composition {
  if (!src) return composition
  return { ...composition, layers: composition.layers.map((l) => (l.type === 'plate' ? { ...l, src } : l)) }
}

/** Set the content of the first text layer whose slot is in `slots` (paint order). */
function setSlot(layers: Layer[], slots: readonly TextSlot[], content: string): Layer[] {
  let done = false
  return layers.map((layer) => {
    if (!done && layer.type === 'text' && slots.includes(layer.slot)) {
      done = true
      return { ...layer, content }
    }
    return layer
  })
}

// The secondary text slot varies by layout: list → body, cta → cta, quote → caption.
const SECONDARY_SLOTS: readonly TextSlot[] = ['body', 'cta', 'caption']

/**
 * Inject a slide's copy into an archetype composition: headline → the `headline` slot, body → the first
 * secondary slot (body/cta/caption). An optional `kicker` overrides the decorative eyebrow (else the
 * template's authored label stays). Empty fields leave the template text untouched. Immutable — the shared
 * registry composition is never mutated.
 */
export function injectCopy(composition: Composition, slide: CarouselSlide, kicker?: string): Composition {
  let layers = composition.layers
  if (slide.headline) layers = setSlot(layers, ['headline'], slide.headline)
  if (slide.body) layers = setSlot(layers, SECONDARY_SLOTS, slide.body)
  if (kicker !== undefined) layers = setSlot(layers, ['kicker'], kicker)
  return { ...composition, layers }
}

export type ComposeOptions = { feedSystemSlug: string | null; ratio: AspectRatio; postId: string; kicker?: string }

/**
 * Turn a post's carousel copy into renderable scene graphs — one per slide — by sampling archetypes from
 * the client's style, at the chosen ratio. Pure and Konva-free, so the generation endpoint can run it
 * server-side; the imagery layer (Phase B) fills each composition's plate/vector afterwards.
 */
export function composeSlides(slides: CarouselSlide[], { feedSystemSlug, ratio, postId, kicker }: ComposeOptions): Composition[] {
  const style = getStyle(feedSystemSlug)
  const size = RATIO_SIZES[ratio]
  const seed = hashSeed(postId)
  return slides.map((slide, index) => {
    const arch = archetypeForSlide(style, slide, index, slides.length, seed)
    const injected = injectCopy(arch.composition, slide, kicker)
    const resolved = resolveComposition(injected, size)
    return { ...resolved, id: `${postId}-slide-${slide.slide_number ?? index}`, feedSystemId: feedSystemSlug ?? 'editorial' }
  })
}

/**
 * Compose a *post's* carousel copy with the shared convention every surface must agree on: the standard
 * post ratio and the client name as the decorative kicker. The one home for that convention — used by
 * stored generation (`composePostVisuals`), the on-demand review/calendar endpoint, and the client-side
 * wizard/approval preview — so every path renders identical slides. (When per-post ratios land, thread
 * the post's ratio here and all callers follow.)
 */
export function composePostSlides(
  slides: CarouselSlide[],
  { feedSystemSlug, postId, clientName }: { feedSystemSlug: string | null; postId: string; clientName?: string | null }
): Composition[] {
  return composeSlides(slides, { feedSystemSlug, ratio: DEFAULT_RATIO, postId, kicker: clientName ?? '' })
}

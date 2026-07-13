import type { Composition, Layer, TextSlot } from '@/lib/scene-graph'
import type { CarouselSlide } from '@/types/api'
import { feedSystemPack } from './feed-system-compositions'
import { RATIO_SIZES, resolveComposition, type AspectRatio } from './layout/anchor'
import type { ReferenceRole } from './reference-compositions'

// Interior (non-cover, non-cta) slides rotate through these editorial roles for visual variety.
const CONTENT_ROLES: readonly ReferenceRole[] = ['statement', 'list', 'quote']

/** Pick the composition role for a slide: cover first, cta last, interior slides cycle for variety. */
export function roleForSlide(slide: CarouselSlide, index: number, total: number): ReferenceRole {
  if (slide.slide_role === 'cover' || index === 0) return 'cover'
  if (slide.slide_role === 'cta' || (total > 1 && index === total - 1)) return 'cta'
  return CONTENT_ROLES[(index - 1) % CONTENT_ROLES.length]!
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

// The secondary text slot varies by role: list → body, cta → cta, quote → caption.
const SECONDARY_SLOTS: readonly TextSlot[] = ['body', 'cta', 'caption']

/**
 * Inject a slide's copy into a template composition: headline → the `headline` slot, body → the first
 * secondary slot (body/cta/caption). An optional `kicker` overrides the decorative eyebrow (else the
 * template's authored label stays). Empty fields leave the template text untouched.
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
 * Turn a post's carousel copy into renderable scene graphs — one per slide — using the client's feed
 * system, at the chosen ratio. Pure and Konva-free, so the generation endpoint can run it server-side;
 * the imagery layer (Phase 4) fills each composition's plate afterwards.
 */
export function composeSlides(slides: CarouselSlide[], { feedSystemSlug, ratio, postId, kicker }: ComposeOptions): Composition[] {
  const pack = feedSystemPack(feedSystemSlug)
  const size = RATIO_SIZES[ratio]
  return slides.map((slide, index) => {
    const role = roleForSlide(slide, index, slides.length)
    const injected = injectCopy(pack[role], slide, kicker)
    const resolved = resolveComposition(injected, size)
    return { ...resolved, id: `${postId}-slide-${slide.slide_number ?? index}`, feedSystemId: feedSystemSlug ?? 'editorial' }
  })
}

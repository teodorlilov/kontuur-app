import {
  bound,
  lit,
  type BlendMode,
  type Clip,
  type Composition,
  type Layer,
  type PlateLayer,
  type Rect,
  type ShapeLayer,
  type TextLayer,
  type TextSlot,
  type Treatment,
  type VAnchor,
} from '@/lib/scene-graph'
import type { CarouselSlide } from '@/types/api'
import { DEFAULT_RATIO, RATIO_SIZES, resolveComposition, type AspectRatio } from './layout/anchor'
import { getStyle, type Style, type TextZone } from './styles'

/**
 * Compose a post's carousel copy into renderable scene graphs — one per slide — the **single, uniform** path
 * that replaced the archetype/template engine. Every slide is the same shape:
 *
 *   design plate (full-bleed) ─ optional scrim ─ text block placed in the style's text zone
 *
 * The plate's `src` is filled later by the design model (`images/generate-plates.ts`) for a generative style,
 * or left as a plain brand colour ground for the compositor-only `quiet-grid`. Design variety comes from the
 * model, not hand-authored layouts — so this file only owns geometry + copy placement + brand text styling.
 * Pure and Konva-free, so it runs server-side (stored generation) and client-side (wizard/approval preview).
 */

// The 4:5 authoring canvas (1080-wide; height adapts per ratio at render). Text sits inside a horizontal margin.
const W = 1080
const H = 1350
const MX = 96
const TW = W - MX * 2 // text column width

// ── Scene-graph authoring primitives (`lit`/`bound` are the shared helpers from scene-graph) ──
const rect = (x: number, y: number, w: number, h: number, rotate = 0): Rect => ({ x, y, w, h, rotate })

function base(a: { id: string; name: string; rect: Rect; vAnchor?: VAnchor; opacity?: number; blendMode?: BlendMode; clip?: Clip }) {
  return {
    id: a.id,
    name: a.name,
    locked: false,
    hidden: false,
    rect: a.rect,
    ...(a.vAnchor ? { vAnchor: a.vAnchor } : {}),
    opacity: lit(a.opacity ?? 1),
    blendMode: lit<BlendMode>(a.blendMode ?? 'normal'),
    clip: a.clip ?? ({ kind: 'none' } as const),
  }
}

// ── Text zones ────────────────────────────────────────────────────────────────
// Where the brand text block sits on the slide (and where generation reserves negative space). Each returns
// the scrim band + the kicker/headline/subtext boxes, anchored so they hold position across the 4:5 / 1:1 ratios.

type SlideRole = 'cover' | 'content' | 'cta'

type ZoneGeom = {
  scrim: { rect: Rect; vAnchor: VAnchor }
  kicker: { rect: Rect; vAnchor: VAnchor }
  headline: { rect: Rect; vAnchor: VAnchor; autoFit: { min: number; max: number } }
  subtext: { rect: Rect; vAnchor: VAnchor }
  align: 'left' | 'center'
}

const ZONES: Record<TextZone, ZoneGeom> = {
  bottom: {
    scrim: { rect: rect(0, 560, W, 790), vAnchor: 'bottom' },
    kicker: { rect: rect(MX, 812, TW, 46), vAnchor: 'bottom' },
    headline: { rect: rect(MX, 866, TW, 300), vAnchor: 'bottom', autoFit: { min: 52, max: 104 } },
    subtext: { rect: rect(MX, 1180, TW, 90), vAnchor: 'bottom' },
    align: 'left',
  },
  center: {
    scrim: { rect: rect(0, 420, W, 520), vAnchor: 'center' },
    kicker: { rect: rect(MX, 466, TW, 52), vAnchor: 'center' },
    headline: { rect: rect(MX, 540, TW, 300), vAnchor: 'center', autoFit: { min: 56, max: 108 } },
    subtext: { rect: rect(MX, 862, TW, 80), vAnchor: 'center' },
    align: 'center',
  },
  top: {
    scrim: { rect: rect(0, 0, W, 660), vAnchor: 'top' },
    kicker: { rect: rect(MX, 150, TW, 50), vAnchor: 'top' },
    headline: { rect: rect(MX, 214, TW, 300), vAnchor: 'top', autoFit: { min: 52, max: 104 } },
    subtext: { rect: rect(MX, 540, TW, 100), vAnchor: 'top' },
    align: 'left',
  },
}

// ── Layer builders ──────────────────────────────────────────────────────────

/** The full-bleed background: a generated design plate (generative styles) or a solid brand colour ground. */
function backgroundLayer(style: Style): PlateLayer | ShapeLayer {
  if (!style.generative) {
    return { ...base({ id: 'ground', name: 'ground', rect: rect(0, 0, W, H), vAnchor: 'fill' }), type: 'shape', shape: 'rect', fill: bound('color.surface') }
  }
  return {
    ...base({ id: 'design', name: 'design', rect: rect(0, 0, W, H), vAnchor: 'fill' }),
    type: 'plate',
    source: 'generated',
    editHeadId: null,
    src: '',
    treatment: lit<Treatment>(style.treatment),
  }
}

/** A soft ink scrim over the text band — a legibility safety net over the generated image (the reserved
 *  negative space is approximate, not pixel-exact). Omitted for the compositor-only colour ground. */
function scrimLayer(geom: ZoneGeom): ShapeLayer {
  return {
    ...base({ id: 'scrim', name: 'scrim', rect: geom.scrim.rect, vAnchor: geom.scrim.vAnchor, opacity: 0.4 }),
    type: 'shape',
    shape: 'rect',
    fill: bound('color.ink'),
  }
}

function textLayer(a: {
  id: string
  slot: TextSlot
  content: string
  rect: Rect
  vAnchor: VAnchor
  family: string
  size: number
  weight: number
  color: string
  align: 'left' | 'center' | 'right'
  autoFit?: { min: number; max: number } | null
  lang?: string
}): TextLayer {
  return {
    ...base({ id: a.id, name: a.id, rect: a.rect, vAnchor: a.vAnchor }),
    type: 'text',
    slot: a.slot,
    content: a.content,
    lang: a.lang ?? 'bg',
    family: bound(a.family),
    size: lit(a.size),
    weight: lit(a.weight),
    color: bound(a.color),
    align: lit(a.align),
    autoFit: a.autoFit ?? null,
  }
}

function roleFor(slide: CarouselSlide, index: number, total: number): SlideRole {
  // An explicit slide_role wins over position; otherwise the first slide is the cover and the last the CTA.
  if (slide.slide_role === 'cta') return 'cta'
  if (slide.slide_role === 'cover') return 'cover'
  if (index === 0) return 'cover'
  if (total > 1 && index === total - 1) return 'cta'
  return 'content'
}

const HEADLINE_WEIGHT: Record<string, number> = { 'bold-blocks': 800, 'quiet-grid': 500, editorial: 700, illustrative: 700 }

/**
 * The kicker/headline/subtext text layers for a slide, placed in the style's zone. Text colours flip with the
 * ground — light type over a (dark-scrimmed) generated plate, ink type on the clean colour ground. The kicker
 * (client name / eyebrow) shows on the cover and CTA only; each layer is omitted when its copy is empty.
 */
function textZoneLayers(role: SlideRole, geom: ZoneGeom, style: Style, slide: CarouselSlide, kicker: string): TextLayer[] {
  const onPlate = style.generative
  const textColor = onPlate ? 'color.surface' : 'color.ink'
  const isCta = role === 'cta'
  const layers: TextLayer[] = []
  if (role !== 'content' && kicker.trim()) {
    layers.push(textLayer({ id: 'kicker', slot: 'kicker', content: kicker, ...geom.kicker, family: 'type.display.family', size: 30, weight: 600, color: onPlate ? 'color.surface' : 'color.accent', align: geom.align }))
  }
  if (slide.headline?.trim()) {
    layers.push(textLayer({ id: 'headline', slot: 'headline', content: slide.headline, ...geom.headline, family: 'type.display.family', size: geom.headline.autoFit.max, weight: HEADLINE_WEIGHT[style.slug] ?? 700, color: textColor, align: geom.align }))
  }
  if (slide.body?.trim()) {
    layers.push(textLayer({ id: 'subtext', slot: isCta ? 'cta' : 'body', content: slide.body, ...geom.subtext, family: isCta ? 'type.display.family' : 'type.body.family', size: isCta ? 40 : 36, weight: isCta ? 600 : 400, color: textColor, align: geom.align }))
  }
  return layers
}

/** Build one slide's composition: background (design plate or colour ground) + optional scrim + the text zone. */
function composeSlide(slide: CarouselSlide, index: number, total: number, style: Style, kicker: string): Composition {
  const geom = ZONES[style.textZone]
  const layers: Layer[] = [backgroundLayer(style)]
  if (style.generative) layers.push(scrimLayer(geom))
  layers.push(...textZoneLayers(roleFor(slide, index, total), geom, style, slide, kicker))
  return { id: `slide-${index}`, feedSystemId: style.slug, brandKitVersion: 1, size: { w: W, h: H }, layers }
}

/** Set every plate layer's `src` to a generated image; absent `src` → unchanged (the gradient plate).
 *  The one shared implementation for the preview grid, the wizard slides, and the imagery filler. */
export function withPlateSrc(composition: Composition, src: string | undefined): Composition {
  if (!src) return composition
  return { ...composition, layers: composition.layers.map((l) => (l.type === 'plate' ? { ...l, src } : l)) }
}

export type ComposeOptions = { feedSystemSlug: string | null; ratio: AspectRatio; postId: string; kicker?: string }

/**
 * Turn a post's carousel copy into renderable scene graphs — one uniform design-plate + text-zone composition
 * per slide, at the chosen ratio, in the client's style. Pure and Konva-free, so the generation endpoint runs
 * it server-side; the imagery layer fills each plate's `src` afterwards (generative styles only).
 */
export function composeSlides(slides: CarouselSlide[], { feedSystemSlug, ratio, postId, kicker }: ComposeOptions): Composition[] {
  const style = getStyle(feedSystemSlug)
  const size = RATIO_SIZES[ratio]
  return slides.map((slide, index) => {
    const composed = composeSlide(slide, index, slides.length, style, kicker ?? '')
    const resolved = resolveComposition(composed, size)
    return { ...resolved, id: `${postId}-slide-${slide.slide_number ?? index}`, feedSystemId: style.slug }
  })
}

/**
 * Compose a *post's* carousel copy with the shared convention every surface must agree on: the standard post
 * ratio and the client name as the eyebrow kicker. The one home for that convention — used by stored
 * generation (`composePostVisuals`), the on-demand review/calendar endpoint, and the client-side
 * wizard/approval preview — so every path renders identical slides.
 */
export function composePostSlides(
  slides: CarouselSlide[],
  { feedSystemSlug, postId, clientName }: { feedSystemSlug: string | null; postId: string; clientName?: string | null }
): Composition[] {
  return composeSlides(slides, { feedSystemSlug, ratio: DEFAULT_RATIO, postId, kicker: clientName ?? '' })
}

// ── Sample slides (previews / picker) ─────────────────────────────────────────
// Placeholder copy for the design-system preview + the style picker. Bulgarian is the authored default;
// `PreviewCell` swaps it to English for non-Bulgarian clients (see preview-copy.ts `localizeComposition`).

const SAMPLE_SLIDES: CarouselSlide[] = [
  { slide_role: 'cover', headline: 'Съдържание, което\nхората помнят', body: '' },
  { headline: 'По-малко шум.\nПовече смисъл.', body: '' },
  { slide_role: 'cta', headline: 'Готови ли сте\nда започнем?', body: 'Свържете се с нас →' },
]

/**
 * A few sample slide compositions in a style — the design-system preview grid + the style picker filmstrip
 * render these. Replaces the old archetype showcase: the samples share the exact compose path real posts use,
 * so what the operator previews is what they get. (`PreviewCell` localizes the placeholder copy.)
 */
export function sampleCompositions(feedSystemSlug: string | null | undefined): Composition[] {
  return composeSlides(SAMPLE_SLIDES, { feedSystemSlug: feedSystemSlug ?? null, ratio: DEFAULT_RATIO, postId: 'sample', kicker: 'За социалните мрежи' })
}

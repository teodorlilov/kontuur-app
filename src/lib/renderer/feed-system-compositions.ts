import type { BlendMode, Binding, BrandTokens, Clip, Composition, Rect, Treatment } from '@/lib/scene-graph'
import { ensureLegibleColors } from '@/lib/brand-kit/extract/color-roles'
import { applyVAnchors } from './layout/anchor'
import { REFERENCE_COMPOSITIONS, type ReferenceRole } from './reference-compositions'

/**
 * The three starter feed systems as real, distinct scene graphs (product §3). A feed system is a
 * *design language*: it lays out the same five roles (cover/statement/list/quote/cta) in its own
 * visual world — backgrounds, type weight/case, chrome, and margins all differ — while every colour
 * and font stays bound to the client's kit tokens. So one kit renders three genuinely different feeds,
 * and editing a colour recolours all of them.
 *
 * - `editorial`   — the flagship: serif display, wide margins, a hairline rule, restraint. (Reuses the
 *                   Phase-0 reference set, which was authored in exactly this language.)
 * - `bold-blocks` — heavy UPPERCASE type on solid colour blocks (accent / ink), no chrome, maximum contrast.
 * - `quiet-grid`  — light type on a white ground, thin corner frames + dot grids, generous whitespace, no photo.
 *
 * Tokens-only (no hex, no literal families) so every composition passes `validateShareableComposition`.
 * Content is Bulgarian to exercise Cyrillic + `locl`.
 */

const lit = <T>(value: T): Binding<T> => ({ mode: 'literal', value })
const bound = <T>(token: string): Binding<T> => ({ mode: 'bound', token })
const rect = (x: number, y: number, w: number, h: number, rotate = 0): Rect => ({ x, y, w, h, rotate })

function base(a: { id: string; name: string; rect: Rect; opacity?: number; blendMode?: BlendMode; clip?: Clip }) {
  return {
    id: a.id,
    name: a.name,
    locked: false,
    hidden: false,
    rect: a.rect,
    opacity: lit(a.opacity ?? 1),
    blendMode: lit<BlendMode>(a.blendMode ?? 'normal'),
    clip: a.clip ?? { kind: 'none' as const },
  }
}

const SIZE = { w: 1080, h: 1350 } as const
const comp = (id: string, feedSystemId: string, layers: Composition['layers']): Composition => ({
  id,
  feedSystemId,
  brandKitVersion: 1,
  size: SIZE,
  layers,
})

/* ─────────────────────────────── bold-blocks ─────────────────────────────── */
// Heavy uppercase type on solid colour blocks. No hairlines, no dots, no arcs — contrast is the system.

const bbCover = comp('bb-cover', 'bold-blocks', [
  { ...base({ id: 'bg', name: 'plate', rect: rect(0, 0, 1080, 1350) }), type: 'plate', source: 'generated', editHeadId: null, src: '', treatment: lit('duotone') },
  { ...base({ id: 'block', name: 'block', rect: rect(0, 760, 1080, 590) }), type: 'shape', shape: 'rect', fill: bound('color.accent') },
  { ...base({ id: 'kicker', name: 'kicker', rect: rect(80, 110, 920, 50) }), type: 'text', slot: 'kicker', content: 'ЗА СОЦИАЛНИТЕ МРЕЖИ', lang: 'bg', family: bound('type.display.family'), size: lit(30), weight: lit(700), color: bound('color.surface'), align: lit('left'), autoFit: null },
  { ...base({ id: 'headline', name: 'headline', rect: rect(80, 820, 920, 470) }), type: 'text', slot: 'headline', content: 'СЪДЪРЖАНИЕ, КОЕТО\nХОРАТА ПОМНЯТ', lang: 'bg', family: bound('type.display.family'), size: lit(126), weight: lit(800), color: bound('color.surface'), align: lit('left'), autoFit: { min: 72, max: 148 } },
])

// Subject cutout (background-removed) floating on a solid accent block — the collage look, in bold-blocks'
// graphic language. The statement rides the bottom; the cutout fills the upper two-thirds.
const bbStatement = comp('bb-statement', 'bold-blocks', [
  { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350) }), type: 'shape', shape: 'rect', fill: bound('color.accent') },
  { ...base({ id: 'cutout', name: 'subject', rect: rect(140, 130, 800, 760) }), type: 'plate', source: 'generated', editHeadId: null, src: '', treatment: lit<Treatment>('none'), cutout: true },
  { ...base({ id: 'stmt', name: 'statement', rect: rect(80, 960, 920, 300) }), type: 'text', slot: 'headline', content: 'ПО-МАЛКО ШУМ.\nПОВЕЧЕ СМИСЪЛ.', lang: 'bg', family: bound('type.display.family'), size: lit(100), weight: lit(900), color: bound('color.surface'), align: lit('center'), autoFit: { min: 60, max: 118 } },
])

const bbList = comp('bb-list', 'bold-blocks', [
  { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350) }), type: 'shape', shape: 'rect', fill: bound('color.surface') },
  { ...base({ id: 'block', name: 'block', rect: rect(0, 0, 1080, 430) }), type: 'shape', shape: 'rect', fill: bound('color.ink') },
  { ...base({ id: 'kicker', name: 'kicker', rect: rect(80, 120, 920, 44) }), type: 'text', slot: 'kicker', content: 'СТЪПКИ', lang: 'bg', family: bound('type.display.family'), size: lit(28), weight: lit(700), color: bound('color.surface'), align: lit('left'), autoFit: null },
  { ...base({ id: 'headline', name: 'headline', rect: rect(80, 180, 920, 200) }), type: 'text', slot: 'headline', content: 'КАК ЗАПОЧВАМЕ', lang: 'bg', family: bound('type.display.family'), size: lit(92), weight: lit(800), color: bound('color.surface'), align: lit('left'), autoFit: { min: 56, max: 104 } },
  { ...base({ id: 'body', name: 'list', rect: rect(80, 520, 920, 760) }), type: 'text', slot: 'body', content: '01  ПРОУЧВАМЕ МАРКАТА\n02  СЪБИРАМЕ ИДЕИ\n03  ПРОЕКТИРАМЕ ВИЗИЯ\n04  ПУБЛИКУВАМЕ', lang: 'bg', family: bound('type.body.family'), size: lit(50), weight: lit(700), color: bound('color.ink'), align: lit('left'), autoFit: null, listStyle: 'numbered' },
])

const bbQuote = comp('bb-quote', 'bold-blocks', [
  { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350) }), type: 'shape', shape: 'rect', fill: bound('color.ink') },
  { ...base({ id: 'qmark', name: 'quote-mark', rect: rect(80, 170, 220, 176) }), type: 'mark', packElementId: 'ref-quote-mark', roleOverrides: {} },
  { ...base({ id: 'quote', name: 'quote', rect: rect(80, 360, 920, 540) }), type: 'text', slot: 'headline', content: 'ДИЗАЙНЪТ Е\nМЪЛЧАЛИВ ПОСЛАНИК.', lang: 'bg', family: bound('type.display.family'), size: lit(96), weight: lit(800), color: bound('color.surface'), align: lit('left'), autoFit: { min: 56, max: 110 } },
  { ...base({ id: 'attr', name: 'attribution', rect: rect(80, 960, 920, 60) }), type: 'text', slot: 'caption', content: '— ПОЛ РАНД', lang: 'bg', family: bound('type.body.family'), size: lit(34), weight: lit(700), color: bound('color.accent'), align: lit('left'), autoFit: null },
])

const bbCta = comp('bb-cta', 'bold-blocks', [
  { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350) }), type: 'shape', shape: 'rect', fill: bound('color.accent') },
  { ...base({ id: 'headline', name: 'headline', rect: rect(80, 430, 920, 400) }), type: 'text', slot: 'headline', content: 'ГОТОВИ ЛИ СТЕ\nДА ЗАПОЧНЕМ?', lang: 'bg', family: bound('type.display.family'), size: lit(108), weight: lit(900), color: bound('color.surface'), align: lit('center'), autoFit: { min: 60, max: 124 } },
  { ...base({ id: 'cta', name: 'cta', rect: rect(80, 860, 920, 80) }), type: 'text', slot: 'cta', content: 'СВЪРЖЕТЕ СЕ С НАС →', lang: 'bg', family: bound('type.display.family'), size: lit(46), weight: lit(800), color: bound('color.surface'), align: lit('center'), autoFit: null },
])

/* ──────────────────────────────── quiet-grid ─────────────────────────────── */
// Light type on white, thin corner frames + dot grids, generous whitespace. Ink text, accent sparingly.
// Never a photo (no plate layers).

const QG_FRAME = { id: 'frame', name: 'frame', rect: rect(64, 64, 952, 1222) }
const frameLayer = () => ({ ...base(QG_FRAME), type: 'chrome' as const, component: 'corner-frame' as const, params: { strokeWidth: lit(2) } })
const qgBg = (id = 'bg') => ({ ...base({ id, name: 'bg', rect: rect(0, 0, 1080, 1350) }), type: 'shape' as const, shape: 'rect' as const, fill: bound<string>('color.surface') })

const qgCover = comp('qg-cover', 'quiet-grid', [
  qgBg(),
  frameLayer(),
  { ...base({ id: 'kicker', name: 'kicker', rect: rect(112, 150, 856, 44) }), type: 'text', slot: 'kicker', content: 'За социалните мрежи', lang: 'bg', family: bound('type.display.family'), size: lit(26), weight: lit(500), color: bound('color.accent'), align: lit('left'), autoFit: null },
  { ...base({ id: 'headline', name: 'headline', rect: rect(112, 560, 856, 560) }), type: 'text', slot: 'headline', content: 'Съдържание, което\nхората помнят', lang: 'bg', family: bound('type.display.family'), size: lit(88), weight: lit(400), color: bound('color.ink'), align: lit('left'), autoFit: { min: 52, max: 100 } },
  { ...base({ id: 'dots', name: 'dot-grid', rect: rect(112, 1150, 180, 60) }), type: 'chrome', component: 'dot-grid', params: { cols: lit(6), rows: lit(2), strokeWidth: lit(3) } },
])

const qgStatement = comp('qg-statement', 'quiet-grid', [
  qgBg(),
  { ...base({ id: 'rule', name: 'rule', rect: rect(440, 470, 200, 20) }), type: 'chrome', component: 'rule', params: { strokeWidth: lit(2) } },
  { ...base({ id: 'stmt', name: 'statement', rect: rect(140, 520, 800, 360) }), type: 'text', slot: 'headline', content: 'По-малко шум.\nПовече смисъл.', lang: 'bg', family: bound('type.display.family'), size: lit(72), weight: lit(400), color: bound('color.ink'), align: lit('center'), autoFit: { min: 44, max: 84 } },
])

const qgList = comp('qg-list', 'quiet-grid', [
  qgBg(),
  frameLayer(),
  { ...base({ id: 'kicker', name: 'kicker', rect: rect(112, 150, 856, 44) }), type: 'text', slot: 'kicker', content: 'Стъпки', lang: 'bg', family: bound('type.display.family'), size: lit(26), weight: lit(500), color: bound('color.accent'), align: lit('left'), autoFit: null },
  { ...base({ id: 'headline', name: 'headline', rect: rect(112, 214, 856, 120) }), type: 'text', slot: 'headline', content: 'Как започваме', lang: 'bg', family: bound('type.display.family'), size: lit(60), weight: lit(500), color: bound('color.ink'), align: lit('left'), autoFit: null },
  { ...base({ id: 'divider', name: 'dot-divider', rect: rect(112, 372, 856, 32) }), type: 'chrome', component: 'dot-grid', params: { cols: lit(28), rows: lit(1), strokeWidth: lit(2) } },
  { ...base({ id: 'body', name: 'list', rect: rect(112, 450, 856, 780) }), type: 'text', slot: 'body', content: '01  Проучваме марката\n02  Събираме идеи\n03  Проектираме визия\n04  Публикуваме', lang: 'bg', family: bound('type.body.family'), size: lit(44), weight: lit(300), color: bound('color.ink'), align: lit('left'), autoFit: null, listStyle: 'numbered' },
])

const qgQuote = comp('qg-quote', 'quiet-grid', [
  qgBg(),
  frameLayer(),
  { ...base({ id: 'qmark', name: 'quote-mark', rect: rect(112, 214, 190, 152) }), type: 'mark', packElementId: 'ref-quote-mark-accent', roleOverrides: {} },
  { ...base({ id: 'quote', name: 'quote', rect: rect(112, 400, 856, 480) }), type: 'text', slot: 'headline', content: 'Дизайнът е\nмълчалив посланик.', lang: 'bg', family: bound('type.display.family'), size: lit(76), weight: lit(400), color: bound('color.ink'), align: lit('left'), autoFit: { min: 48, max: 88 } },
  { ...base({ id: 'attr', name: 'attribution', rect: rect(112, 940, 856, 60) }), type: 'text', slot: 'caption', content: '— Пол Ранд', lang: 'bg', family: bound('type.body.family'), size: lit(32), weight: lit(500), color: bound('color.accent'), align: lit('left'), autoFit: null },
])

const qgCta = comp('qg-cta', 'quiet-grid', [
  qgBg(),
  frameLayer(),
  { ...base({ id: 'headline', name: 'headline', rect: rect(140, 470, 800, 360) }), type: 'text', slot: 'headline', content: 'Готови ли сте\nда започнем?', lang: 'bg', family: bound('type.display.family'), size: lit(84), weight: lit(400), color: bound('color.ink'), align: lit('center'), autoFit: { min: 50, max: 96 } },
  { ...base({ id: 'cta', name: 'cta', rect: rect(140, 860, 800, 70) }), type: 'text', slot: 'cta', content: 'Свържете се с нас →', lang: 'bg', family: bound('type.display.family'), size: lit(42), weight: lit(600), color: bound('color.accent'), align: lit('center'), autoFit: null },
  { ...base({ id: 'dots', name: 'dot-grid', rect: rect(450, 1180, 180, 50) }), type: 'chrome', component: 'dot-grid', params: { cols: lit(6), rows: lit(2), strokeWidth: lit(3) } },
])

/* ─────────────────────────────────── map ─────────────────────────────────── */

export type FeedSystemSlug = 'editorial' | 'bold-blocks' | 'quiet-grid'

// Vertical anchors so one 4:5 definition adapts to 1:1 — backgrounds fill, the bold colour blocks +
// centred statements ride the bottom edge, quiet-grid's inset frame stretches. (See applyVAnchors.)
const boldBlocks: Record<ReferenceRole, Composition> = {
  cover: applyVAnchors(bbCover, { bg: 'fill', block: 'bottom', headline: 'bottom' }),
  statement: applyVAnchors(bbStatement, { bg: 'fill', cutout: 'center', stmt: 'bottom' }),
  list: applyVAnchors(bbList, { bg: 'fill' }),
  quote: applyVAnchors(bbQuote, { bg: 'fill', quote: 'center', attr: 'bottom' }),
  cta: applyVAnchors(bbCta, { bg: 'fill', headline: 'center', cta: 'center' }),
}
const quietGrid: Record<ReferenceRole, Composition> = {
  cover: applyVAnchors(qgCover, { bg: 'fill', frame: 'stretch', headline: 'center', dots: 'bottom' }),
  statement: applyVAnchors(qgStatement, { bg: 'fill', rule: 'center', stmt: 'center' }),
  list: applyVAnchors(qgList, { bg: 'fill', frame: 'stretch' }),
  quote: applyVAnchors(qgQuote, { bg: 'fill', frame: 'stretch', quote: 'center', attr: 'bottom' }),
  cta: applyVAnchors(qgCta, { bg: 'fill', frame: 'stretch', headline: 'center', cta: 'center', dots: 'bottom' }),
}

/** editorial reuses the Phase-0 reference set — it was authored in this exact language. */
export const FEED_SYSTEM_PACKS: Record<FeedSystemSlug, Record<ReferenceRole, Composition>> = {
  editorial: REFERENCE_COMPOSITIONS,
  'bold-blocks': boldBlocks,
  'quiet-grid': quietGrid,
}

export const ROLE_ORDER: readonly ReferenceRole[] = ['cover', 'statement', 'list', 'quote', 'cta']

function isSlug(slug: string | null | undefined): slug is FeedSystemSlug {
  return slug === 'editorial' || slug === 'bold-blocks' || slug === 'quiet-grid'
}

/** The five compositions for a feed system, unknown/absent falling back to editorial (the default). */
export function feedSystemPack(slug: string | null | undefined): Record<ReferenceRole, Composition> {
  return isSlug(slug) ? FEED_SYSTEM_PACKS[slug] : FEED_SYSTEM_PACKS.editorial
}

/** The five compositions in role order — the sequence the preview grid cycles. */
export function feedSystemCompositions(slug: string | null | undefined): Composition[] {
  const pack = feedSystemPack(slug)
  return ROLE_ORDER.map((role) => pack[role])
}

// The type weights each system needs loaded (bold reaches for 800/900; quiet for 300). The kit token
// arrays only carry a couple of weights, so a font would synthesize (faux) these — merge them in for
// the preview so every weight renders from a real face.
const SYSTEM_WEIGHTS: Record<FeedSystemSlug, { display: number[]; body: number[] }> = {
  editorial: { display: [400, 600, 700], body: [400, 600] },
  'bold-blocks': { display: [700, 800, 900], body: [700, 800] },
  'quiet-grid': { display: [400, 500, 600], body: [300, 400, 500] },
}

const mergeWeights = (a: number[], b: number[]): number[] => [...new Set([...a, ...b])].sort((x, y) => x - y)

/**
 * The kit tokens a feed system renders with: same families, the weight arrays widened to cover the
 * weights this system's compositions ask for (so `kitFontsHref` loads them and no weight falls back to a
 * synthesized face), and the colours passed through `ensureLegibleColors` so a low-contrast extraction
 * (e.g. `ink === surface`) never renders invisible text. This is the choke point every render surface
 * funnels through, so the fix reaches stored kits without a re-extraction.
 */
export function feedSystemTokens(slug: string | null | undefined, tokens: BrandTokens): BrandTokens {
  const need = isSlug(slug) ? SYSTEM_WEIGHTS[slug] : SYSTEM_WEIGHTS.editorial
  return {
    ...tokens,
    color: ensureLegibleColors(tokens.color),
    type: {
      ...tokens.type,
      display: { ...tokens.type.display, weights: mergeWeights(tokens.type.display.weights, need.display) },
      body: { ...tokens.type.body, weights: mergeWeights(tokens.type.body.weights, need.body) },
    },
  }
}

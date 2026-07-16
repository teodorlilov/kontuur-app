import type { Composition } from '@/lib/scene-graph'
import { applyVAnchors } from '../layout/anchor'
import { archetype, type Archetype } from './types'
import { base, bound, comp, lit, rect } from './helpers'

/**
 * The **graphic** archetypes — pure-compositor, no-photo layouts (imagery `'none'`, zero fal spend) that
 * break the "always a background photo" monotony. Entirely token-bound, so the extracted palette + fonts
 * paint them and editing a colour recolours them live. Style-agnostic: any style can draw them into its
 * content pool. This is where the immediate design variety comes from.
 */

// A hard colour-block split — accent band over an ink ground — with the headline straddling the seam.
const split: Composition = comp('split', 'graphic', [
  { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350), vAnchor: 'fill' }), type: 'shape', shape: 'rect', fill: bound('color.ink') },
  { ...base({ id: 'band', name: 'band', rect: rect(0, 0, 1080, 540) }), type: 'shape', shape: 'rect', fill: bound('color.accent') },
  { ...base({ id: 'headline', name: 'headline', rect: rect(80, 380, 920, 400), vAnchor: 'center' }), type: 'text', slot: 'headline', content: 'Ясен\nконтраст.', lang: 'bg', family: bound('type.display.family'), size: lit(120), weight: lit(800), color: bound('color.surface'), align: lit('center'), autoFit: { min: 56, max: 132 } },
  { ...base({ id: 'body', name: 'body', rect: rect(120, 900, 840, 240), vAnchor: 'bottom' }), type: 'text', slot: 'body', content: 'Едно съобщение, разказано в два тона.', lang: 'bg', family: bound('type.body.family'), size: lit(40), weight: lit(500), color: bound('color.surface'), align: lit('center'), autoFit: null },
])

// An oversized display figure (the headline as a stat) with a supporting line — big-type, no photo.
const stat: Composition = comp('stat', 'graphic', [
  { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350), vAnchor: 'fill' }), type: 'shape', shape: 'rect', fill: bound('color.surface') },
  { ...base({ id: 'bar', name: 'bar', rect: rect(80, 300, 220, 24) }), type: 'shape', shape: 'rect', fill: bound('color.accent') },
  { ...base({ id: 'headline', name: 'figure', rect: rect(64, 372, 952, 540) }), type: 'text', slot: 'headline', content: 'Всеки\nдетайл', lang: 'bg', family: bound('type.display.family'), size: lit(200), weight: lit(900), color: bound('color.ink'), align: lit('left'), autoFit: { min: 96, max: 320 } },
  { ...base({ id: 'body', name: 'support', rect: rect(80, 980, 860, 280), vAnchor: 'bottom' }), type: 'text', slot: 'body', content: 'има значение за това как марката се възприема.', lang: 'bg', family: bound('type.body.family'), size: lit(46), weight: lit(400), color: bound('color.ink'), align: lit('left'), autoFit: null },
])

// A big editorial statement with a small annotation set off by a leader stub (v1; true leader-lines
// land with the Phase-C annotation chrome).
const annotatedType: Composition = comp('annotated-type', 'graphic', [
  { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350), vAnchor: 'fill' }), type: 'shape', shape: 'rect', fill: bound('color.surface') },
  { ...base({ id: 'kicker', name: 'kicker', rect: rect(96, 150, 888, 50) }), type: 'text', slot: 'kicker', content: 'Бележка', lang: 'bg', family: bound('type.display.family'), size: lit(28), weight: lit(600), color: bound('color.accent'), align: lit('left'), autoFit: null },
  { ...base({ id: 'headline', name: 'headline', rect: rect(96, 300, 888, 540) }), type: 'text', slot: 'headline', content: 'Всяка дума\nноси тежест.', lang: 'bg', family: bound('type.display.family'), size: lit(100), weight: lit(700), color: bound('color.ink'), align: lit('left'), autoFit: { min: 56, max: 112 } },
  { ...base({ id: 'annot-rule', name: 'leader', rect: rect(96, 990, 190, 20) }), type: 'chrome', component: 'annotation', params: { strokeWidth: lit(2), dot: lit(6) } },
  { ...base({ id: 'body', name: 'annotation', rect: rect(300, 950, 684, 220) }), type: 'text', slot: 'body', content: 'затова я подбираме внимателно, преди да я публикуваме.', lang: 'bg', family: bound('type.body.family'), size: lit(38), weight: lit(400), color: bound('color.accent'), align: lit('left'), autoFit: null },
])

// A checkerboard tile grid (accent/surface on an ink ground) with the headline + body below — the
// geometric, all-graphic layout.
const tileGrid: Composition = comp('tile-grid', 'graphic', [
  { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350), vAnchor: 'fill' }), type: 'shape', shape: 'rect', fill: bound('color.ink') },
  { ...base({ id: 't1', name: 'tile', rect: rect(80, 140, 280, 320) }), type: 'shape', shape: 'rect', fill: bound('color.accent') },
  { ...base({ id: 't2', name: 'tile', rect: rect(400, 140, 280, 320) }), type: 'shape', shape: 'rect', fill: bound('color.surface') },
  { ...base({ id: 't3', name: 'tile', rect: rect(720, 140, 280, 320) }), type: 'shape', shape: 'rect', fill: bound('color.accent') },
  { ...base({ id: 't4', name: 'tile', rect: rect(80, 500, 280, 320) }), type: 'shape', shape: 'rect', fill: bound('color.surface') },
  { ...base({ id: 't5', name: 'tile', rect: rect(400, 500, 280, 320) }), type: 'shape', shape: 'rect', fill: bound('color.accent') },
  { ...base({ id: 't6', name: 'tile', rect: rect(720, 500, 280, 320) }), type: 'shape', shape: 'rect', fill: bound('color.surface') },
  { ...base({ id: 'headline', name: 'headline', rect: rect(80, 880, 920, 260), vAnchor: 'bottom' }), type: 'text', slot: 'headline', content: 'Система, не\nслучайност.', lang: 'bg', family: bound('type.display.family'), size: lit(84), weight: lit(800), color: bound('color.surface'), align: lit('left'), autoFit: { min: 48, max: 96 } },
  { ...base({ id: 'body', name: 'body', rect: rect(80, 1160, 920, 120), vAnchor: 'bottom' }), type: 'text', slot: 'body', content: 'Всеки пост на своето място.', lang: 'bg', family: bound('type.body.family'), size: lit(34), weight: lit(400), color: bound('color.surface'), align: lit('left'), autoFit: null },
])

// A closing call-to-action on an accent ground — a no-photo closer any style can end on.
const ctaGraphic: Composition = comp('cta-graphic', 'graphic', [
  { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350), vAnchor: 'fill' }), type: 'shape', shape: 'rect', fill: bound('color.accent') },
  { ...base({ id: 'headline', name: 'headline', rect: rect(96, 470, 888, 360), vAnchor: 'center' }), type: 'text', slot: 'headline', content: 'Готови ли сте\nда започнем?', lang: 'bg', family: bound('type.display.family'), size: lit(96), weight: lit(800), color: bound('color.surface'), align: lit('center'), autoFit: { min: 56, max: 108 } },
  { ...base({ id: 'cta', name: 'cta', rect: rect(96, 880, 888, 80), vAnchor: 'center' }), type: 'text', slot: 'cta', content: 'Свържете се с нас →', lang: 'bg', family: bound('type.display.family'), size: lit(44), weight: lit(700), color: bound('color.surface'), align: lit('center'), autoFit: null },
])

export const GRAPHIC_ARCHETYPES: Archetype[] = [
  archetype('split', 'content', 'none', ['headline', 'body'], split),
  archetype('stat', 'content', 'none', ['headline', 'body'], stat),
  archetype('annotated-type', 'content', 'none', ['kicker', 'headline', 'body'], annotatedType),
  archetype('tile-grid', 'content', 'none', ['headline', 'body'], applyVAnchors(tileGrid, { bg: 'fill' })),
  archetype('cta-graphic', 'closer', 'none', ['headline', 'cta'], ctaGraphic),
]

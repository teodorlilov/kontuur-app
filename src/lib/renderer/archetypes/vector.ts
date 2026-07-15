import type { Composition } from '@/lib/scene-graph'
import { applyVAnchors } from '../layout/anchor'
import { archetype, type Archetype } from './types'
import { base, bound, comp, lit, rect } from './helpers'

/**
 * The **vector** archetypes — illustrative layouts built around a Recraft-generated brand mark instead of
 * a photo. The `MarkLayer` carries `source: 'generated'`; the imagery layer (`fillImagery`) fills its
 * `svg` from the brand's motifs (banked + reused), and it fail-softs to just the colour ground + type when
 * no vector is available. All token-bound, so the mark sits on-palette. `packElementId` is a placeholder —
 * only used if the generated `svg` is absent, in which case nothing renders (fail-soft).
 */

// A big generated mark on an accent ground with the headline beneath — the illustrative cover.
const cover: Composition = comp('vector-cover', 'illustrative', [
  { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350), vAnchor: 'fill' }), type: 'shape', shape: 'rect', fill: bound('color.accent') },
  { ...base({ id: 'mark', name: 'graphic', rect: rect(280, 170, 520, 520), vAnchor: 'center' }), type: 'mark', packElementId: 'generated-vector', roleOverrides: {}, source: 'generated' },
  { ...base({ id: 'kicker', name: 'kicker', rect: rect(96, 820, 888, 50), vAnchor: 'bottom' }), type: 'text', slot: 'kicker', content: 'ЗА СОЦИАЛНИТЕ МРЕЖИ', lang: 'bg', family: bound('type.display.family'), size: lit(30), weight: lit(600), color: bound('color.surface'), align: lit('left'), autoFit: null },
  { ...base({ id: 'headline', name: 'headline', rect: rect(96, 900, 888, 360), vAnchor: 'bottom' }), type: 'text', slot: 'headline', content: 'Съдържание, което\nхората помнят', lang: 'bg', family: bound('type.display.family'), size: lit(100), weight: lit(700), color: bound('color.surface'), align: lit('left'), autoFit: { min: 56, max: 112 } },
])

// A centred mark over a statement — the illustrative content slide.
const hero: Composition = comp('vector-hero', 'illustrative', [
  { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350), vAnchor: 'fill' }), type: 'shape', shape: 'rect', fill: bound('color.surface') },
  { ...base({ id: 'mark', name: 'graphic', rect: rect(340, 150, 400, 400) }), type: 'mark', packElementId: 'generated-vector', roleOverrides: {}, source: 'generated' },
  { ...base({ id: 'headline', name: 'headline', rect: rect(96, 620, 888, 340), vAnchor: 'center' }), type: 'text', slot: 'headline', content: 'По-малко шум.\nПовече смисъл.', lang: 'bg', family: bound('type.display.family'), size: lit(84), weight: lit(700), color: bound('color.ink'), align: lit('center'), autoFit: { min: 48, max: 96 } },
  { ...base({ id: 'body', name: 'body', rect: rect(120, 1000, 840, 220), vAnchor: 'bottom' }), type: 'text', slot: 'body', content: 'Всеки детайл говори за марката.', lang: 'bg', family: bound('type.body.family'), size: lit(40), weight: lit(400), color: bound('color.ink'), align: lit('center'), autoFit: null },
])

export const VECTOR_ARCHETYPES: Archetype[] = [
  archetype('vector-cover', 'opener', 'vector', ['kicker', 'headline'], applyVAnchors(cover, { bg: 'fill', mark: 'center', kicker: 'bottom', headline: 'bottom' })),
  archetype('vector-hero', 'content', 'vector', ['headline', 'body'], applyVAnchors(hero, { bg: 'fill', headline: 'center', body: 'bottom' })),
]

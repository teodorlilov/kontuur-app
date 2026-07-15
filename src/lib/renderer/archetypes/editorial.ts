import type { Composition, Treatment } from '@/lib/scene-graph'
import { applyVAnchors } from '../layout/anchor'
import { archetype, type Archetype } from './types'
import { base, bound, comp, lit, rect } from './helpers'

/**
 * The **editorial** archetypes — the flagship design language: serif display, wide margins, a hairline
 * rule, restraint. Ported verbatim from the Phase-0 reference set (they were authored in exactly this
 * language); geometry unchanged, now tagged with `kind`/`imagery`/`slots`. Content is Bulgarian to
 * exercise Cyrillic + `locl`.
 */

const cover: Composition = comp('editorial-cover', 'editorial', [
  { ...base({ id: 'bg', name: 'plate', rect: rect(0, 0, 1080, 1350) }), type: 'plate', source: 'generated', editHeadId: null, src: '', treatment: lit('duotone') },
  { ...base({ id: 'scrim', name: 'scrim', rect: rect(0, 0, 1080, 1350), opacity: 0.4 }), type: 'shape', shape: 'rect', fill: bound('color.ink') },
  { ...base({ id: 'kicker', name: 'kicker', rect: rect(96, 128, 888, 60) }), type: 'text', slot: 'kicker', content: 'ЗА СОЦИАЛНИТЕ МРЕЖИ', lang: 'bg', family: bound('type.display.family'), size: lit(30), weight: lit(600), color: bound('color.surface'), align: lit('left'), autoFit: null },
  { ...base({ id: 'headline', name: 'headline', rect: rect(96, 720, 888, 470) }), type: 'text', slot: 'headline', content: 'Съдържание, което\nхората помнят', lang: 'bg', family: bound('type.display.family'), size: lit(108), weight: lit(700), color: bound('color.surface'), align: lit('left'), autoFit: { min: 64, max: 120 } },
  { ...base({ id: 'dots', name: 'index', rect: rect(96, 1244, 240, 20) }), type: 'chrome', component: 'index-dots', params: { count: lit(5), active: lit(0) } },
])

const statement: Composition = comp('editorial-statement', 'editorial', [
  { ...base({ id: 'bg', name: 'plate', rect: rect(0, 0, 1080, 1350) }), type: 'plate', source: 'generated', editHeadId: null, src: '', treatment: lit('duotone') },
  { ...base({ id: 'blend', name: 'blend', rect: rect(140, 300, 800, 750), blendMode: 'multiply', clip: { kind: 'rect', radius: 32 } }), type: 'shape', shape: 'rect', fill: bound('color.accent-deep') },
  { ...base({ id: 'stmt', name: 'statement', rect: rect(140, 470, 800, 410) }), type: 'text', slot: 'headline', content: 'По-малко шум.\nПовече смисъл.', lang: 'bg', family: bound('type.display.family'), size: lit(92), weight: lit(700), color: bound('color.surface'), align: lit('center'), autoFit: { min: 56, max: 104 } },
])

const list: Composition = comp('editorial-list', 'editorial', [
  { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350) }), type: 'shape', shape: 'rect', fill: bound('color.surface') },
  { ...base({ id: 'kicker', name: 'kicker', rect: rect(96, 128, 888, 50) }), type: 'text', slot: 'kicker', content: 'СТЪПКИ', lang: 'bg', family: bound('type.display.family'), size: lit(28), weight: lit(600), color: bound('color.accent'), align: lit('left'), autoFit: null },
  { ...base({ id: 'headline', name: 'headline', rect: rect(96, 190, 888, 140) }), type: 'text', slot: 'headline', content: 'Как започваме', lang: 'bg', family: bound('type.display.family'), size: lit(72), weight: lit(700), color: bound('color.ink'), align: lit('left'), autoFit: null },
  { ...base({ id: 'rule', name: 'rule', rect: rect(96, 360, 888, 20) }), type: 'chrome', component: 'rule', params: { strokeWidth: lit(2) } },
  { ...base({ id: 'body', name: 'list', rect: rect(96, 430, 888, 760) }), type: 'text', slot: 'body', content: '01  Проучваме марката\n02  Събираме идеи\n03  Проектираме визия\n04  Публикуваме', lang: 'bg', family: bound('type.body.family'), size: lit(46), weight: lit(400), color: bound('color.ink'), align: lit('left'), autoFit: null, listStyle: 'numbered' },
])

const quote: Composition = comp('editorial-quote', 'editorial', [
  { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350) }), type: 'shape', shape: 'rect', fill: bound('color.accent') },
  { ...base({ id: 'qmark', name: 'quote-mark', rect: rect(96, 150, 180, 144) }), type: 'mark', packElementId: 'ref-quote-mark', roleOverrides: {} },
  { ...base({ id: 'quote', name: 'quote', rect: rect(96, 380, 888, 500) }), type: 'text', slot: 'headline', content: 'Дизайнът е\nмълчалив посланик.', lang: 'bg', family: bound('type.display.family'), size: lit(84), weight: lit(700), color: bound('color.surface'), align: lit('left'), autoFit: { min: 52, max: 96 } },
  { ...base({ id: 'attr', name: 'attribution', rect: rect(96, 940, 888, 60) }), type: 'text', slot: 'caption', content: '— Пол Ранд', lang: 'bg', family: bound('type.body.family'), size: lit(34), weight: lit(400), color: bound('color.surface'), align: lit('left'), autoFit: null },
])

const cta: Composition = comp('editorial-cta', 'editorial', [
  { ...base({ id: 'bg', name: 'plate', rect: rect(0, 0, 1080, 1350) }), type: 'plate', source: 'generated', editHeadId: null, src: '', treatment: lit<Treatment>('duotone') },
  { ...base({ id: 'headline', name: 'headline', rect: rect(96, 430, 888, 360) }), type: 'text', slot: 'headline', content: 'Готови ли сте\nда започнем?', lang: 'bg', family: bound('type.display.family'), size: lit(96), weight: lit(700), color: bound('color.surface'), align: lit('center'), autoFit: { min: 56, max: 108 } },
  { ...base({ id: 'cta', name: 'cta', rect: rect(96, 820, 888, 80) }), type: 'text', slot: 'cta', content: 'Свържете се с нас →', lang: 'bg', family: bound('type.display.family'), size: lit(44), weight: lit(600), color: bound('color.surface'), align: lit('center'), autoFit: null },
  { ...base({ id: 'arc', name: 'arc', rect: rect(760, 120, 224, 224) }), type: 'chrome', component: 'arc', params: { strokeWidth: lit(3) } },
])

export const EDITORIAL_ARCHETYPES: Archetype[] = [
  archetype('editorial-cover', 'opener', 'photo', ['kicker', 'headline'], applyVAnchors(cover, { bg: 'fill', scrim: 'fill', headline: 'bottom', dots: 'bottom' })),
  archetype('editorial-statement', 'content', 'photo', ['headline'], applyVAnchors(statement, { bg: 'fill', blend: 'center', stmt: 'center' })),
  archetype('editorial-list', 'content', 'none', ['kicker', 'headline', 'body'], applyVAnchors(list, { bg: 'fill' })),
  archetype('editorial-quote', 'content', 'none', ['headline', 'caption'], applyVAnchors(quote, { bg: 'fill', quote: 'center', attr: 'bottom' })),
  archetype('editorial-cta', 'closer', 'photo', ['headline', 'cta'], applyVAnchors(cta, { bg: 'fill', headline: 'center', cta: 'center' })),
]

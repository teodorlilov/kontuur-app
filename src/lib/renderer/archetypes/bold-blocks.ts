import type { Composition, Treatment } from '@/lib/scene-graph'
import { applyVAnchors } from '../layout/anchor'
import { archetype, type Archetype } from './types'
import { base, bound, comp, lit, rect } from './helpers'

/**
 * The **bold-blocks** archetypes — heavy UPPERCASE type on solid colour blocks (accent / ink), no chrome,
 * maximum contrast. The statement is a background-removed subject **cutout** floating on an accent block
 * (the collage look). Ported verbatim from the Phase-1 pack; geometry unchanged.
 */

const cover: Composition = comp('bold-blocks-cover', 'bold-blocks', [
  { ...base({ id: 'bg', name: 'plate', rect: rect(0, 0, 1080, 1350) }), type: 'plate', source: 'generated', editHeadId: null, src: '', treatment: lit('duotone') },
  { ...base({ id: 'block', name: 'block', rect: rect(0, 760, 1080, 590) }), type: 'shape', shape: 'rect', fill: bound('color.accent') },
  { ...base({ id: 'kicker', name: 'kicker', rect: rect(80, 110, 920, 50) }), type: 'text', slot: 'kicker', content: 'ЗА СОЦИАЛНИТЕ МРЕЖИ', lang: 'bg', family: bound('type.display.family'), size: lit(30), weight: lit(700), color: bound('color.surface'), align: lit('left'), autoFit: null },
  { ...base({ id: 'headline', name: 'headline', rect: rect(80, 820, 920, 470) }), type: 'text', slot: 'headline', content: 'СЪДЪРЖАНИЕ, КОЕТО\nХОРАТА ПОМНЯТ', lang: 'bg', family: bound('type.display.family'), size: lit(126), weight: lit(800), color: bound('color.surface'), align: lit('left'), autoFit: { min: 72, max: 148 } },
])

const statement: Composition = comp('bold-blocks-statement', 'bold-blocks', [
  { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350) }), type: 'shape', shape: 'rect', fill: bound('color.accent') },
  { ...base({ id: 'cutout', name: 'subject', rect: rect(140, 130, 800, 760) }), type: 'plate', source: 'generated', editHeadId: null, src: '', treatment: lit<Treatment>('none'), cutout: true },
  { ...base({ id: 'stmt', name: 'statement', rect: rect(80, 960, 920, 300) }), type: 'text', slot: 'headline', content: 'ПО-МАЛКО ШУМ.\nПОВЕЧЕ СМИСЪЛ.', lang: 'bg', family: bound('type.display.family'), size: lit(100), weight: lit(900), color: bound('color.surface'), align: lit('center'), autoFit: { min: 60, max: 118 } },
])

const list: Composition = comp('bold-blocks-list', 'bold-blocks', [
  { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350) }), type: 'shape', shape: 'rect', fill: bound('color.surface') },
  { ...base({ id: 'block', name: 'block', rect: rect(0, 0, 1080, 430) }), type: 'shape', shape: 'rect', fill: bound('color.ink') },
  { ...base({ id: 'kicker', name: 'kicker', rect: rect(80, 120, 920, 44) }), type: 'text', slot: 'kicker', content: 'СТЪПКИ', lang: 'bg', family: bound('type.display.family'), size: lit(28), weight: lit(700), color: bound('color.surface'), align: lit('left'), autoFit: null },
  { ...base({ id: 'headline', name: 'headline', rect: rect(80, 180, 920, 200) }), type: 'text', slot: 'headline', content: 'КАК ЗАПОЧВАМЕ', lang: 'bg', family: bound('type.display.family'), size: lit(92), weight: lit(800), color: bound('color.surface'), align: lit('left'), autoFit: { min: 56, max: 104 } },
  { ...base({ id: 'body', name: 'list', rect: rect(80, 520, 920, 760) }), type: 'text', slot: 'body', content: '01  ПРОУЧВАМЕ МАРКАТА\n02  СЪБИРАМЕ ИДЕИ\n03  ПРОЕКТИРАМЕ ВИЗИЯ\n04  ПУБЛИКУВАМЕ', lang: 'bg', family: bound('type.body.family'), size: lit(50), weight: lit(700), color: bound('color.ink'), align: lit('left'), autoFit: null, listStyle: 'numbered' },
])

const quote: Composition = comp('bold-blocks-quote', 'bold-blocks', [
  { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350) }), type: 'shape', shape: 'rect', fill: bound('color.ink') },
  { ...base({ id: 'qmark', name: 'quote-mark', rect: rect(80, 170, 220, 176) }), type: 'mark', packElementId: 'ref-quote-mark', roleOverrides: {} },
  { ...base({ id: 'quote', name: 'quote', rect: rect(80, 360, 920, 540) }), type: 'text', slot: 'headline', content: 'ДИЗАЙНЪТ Е\nМЪЛЧАЛИВ ПОСЛАНИК.', lang: 'bg', family: bound('type.display.family'), size: lit(96), weight: lit(800), color: bound('color.surface'), align: lit('left'), autoFit: { min: 56, max: 110 } },
  { ...base({ id: 'attr', name: 'attribution', rect: rect(80, 960, 920, 60) }), type: 'text', slot: 'caption', content: '— ПОЛ РАНД', lang: 'bg', family: bound('type.body.family'), size: lit(34), weight: lit(700), color: bound('color.accent'), align: lit('left'), autoFit: null },
])

const cta: Composition = comp('bold-blocks-cta', 'bold-blocks', [
  { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350) }), type: 'shape', shape: 'rect', fill: bound('color.accent') },
  { ...base({ id: 'headline', name: 'headline', rect: rect(80, 430, 920, 400) }), type: 'text', slot: 'headline', content: 'ГОТОВИ ЛИ СТЕ\nДА ЗАПОЧНЕМ?', lang: 'bg', family: bound('type.display.family'), size: lit(108), weight: lit(900), color: bound('color.surface'), align: lit('center'), autoFit: { min: 60, max: 124 } },
  { ...base({ id: 'cta', name: 'cta', rect: rect(80, 860, 920, 80) }), type: 'text', slot: 'cta', content: 'СВЪРЖЕТЕ СЕ С НАС →', lang: 'bg', family: bound('type.display.family'), size: lit(46), weight: lit(800), color: bound('color.surface'), align: lit('center'), autoFit: null },
])

export const BOLD_BLOCKS_ARCHETYPES: Archetype[] = [
  archetype('bold-blocks-cover', 'opener', 'photo', ['kicker', 'headline'], applyVAnchors(cover, { bg: 'fill', block: 'bottom', headline: 'bottom' })),
  archetype('bold-blocks-statement', 'content', 'cutout', ['headline'], applyVAnchors(statement, { bg: 'fill', cutout: 'center', stmt: 'bottom' })),
  archetype('bold-blocks-list', 'content', 'none', ['kicker', 'headline', 'body'], applyVAnchors(list, { bg: 'fill' })),
  archetype('bold-blocks-quote', 'content', 'none', ['headline', 'caption'], applyVAnchors(quote, { bg: 'fill', quote: 'center', attr: 'bottom' })),
  archetype('bold-blocks-cta', 'closer', 'none', ['headline', 'cta'], applyVAnchors(cta, { bg: 'fill', headline: 'center', cta: 'center' })),
]

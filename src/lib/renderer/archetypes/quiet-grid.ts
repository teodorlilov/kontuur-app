import type { Composition } from '@/lib/scene-graph'
import { applyVAnchors } from '../layout/anchor'
import { archetype, type Archetype } from './types'
import { base, bound, comp, lit, rect } from './helpers'

/**
 * The **quiet-grid** archetypes — light type on a white ground, thin corner frames + dot grids, generous
 * whitespace. Never a photo (no plate layers), so every slide is a pure-compositor design. Ported verbatim
 * from the Phase-1 pack; geometry unchanged.
 */

const frameLayer = () => ({ ...base({ id: 'frame', name: 'frame', rect: rect(64, 64, 952, 1222) }), type: 'chrome' as const, component: 'corner-frame' as const, params: { strokeWidth: lit(2) } })
const bg = (id = 'bg') => ({ ...base({ id, name: 'bg', rect: rect(0, 0, 1080, 1350) }), type: 'shape' as const, shape: 'rect' as const, fill: bound<string>('color.surface') })

const cover: Composition = comp('quiet-grid-cover', 'quiet-grid', [
  bg(),
  frameLayer(),
  { ...base({ id: 'kicker', name: 'kicker', rect: rect(112, 150, 856, 44) }), type: 'text', slot: 'kicker', content: 'За социалните мрежи', lang: 'bg', family: bound('type.display.family'), size: lit(26), weight: lit(500), color: bound('color.accent'), align: lit('left'), autoFit: null },
  { ...base({ id: 'headline', name: 'headline', rect: rect(112, 560, 856, 560) }), type: 'text', slot: 'headline', content: 'Съдържание, което\nхората помнят', lang: 'bg', family: bound('type.display.family'), size: lit(88), weight: lit(400), color: bound('color.ink'), align: lit('left'), autoFit: { min: 52, max: 100 } },
  { ...base({ id: 'dots', name: 'dot-grid', rect: rect(112, 1150, 180, 60) }), type: 'chrome', component: 'dot-grid', params: { cols: lit(6), rows: lit(2), strokeWidth: lit(3) } },
])

const statement: Composition = comp('quiet-grid-statement', 'quiet-grid', [
  bg(),
  { ...base({ id: 'rule', name: 'rule', rect: rect(440, 470, 200, 20) }), type: 'chrome', component: 'rule', params: { strokeWidth: lit(2) } },
  { ...base({ id: 'stmt', name: 'statement', rect: rect(140, 520, 800, 360) }), type: 'text', slot: 'headline', content: 'По-малко шум.\nПовече смисъл.', lang: 'bg', family: bound('type.display.family'), size: lit(72), weight: lit(400), color: bound('color.ink'), align: lit('center'), autoFit: { min: 44, max: 84 } },
])

const list: Composition = comp('quiet-grid-list', 'quiet-grid', [
  bg(),
  frameLayer(),
  { ...base({ id: 'kicker', name: 'kicker', rect: rect(112, 150, 856, 44) }), type: 'text', slot: 'kicker', content: 'Стъпки', lang: 'bg', family: bound('type.display.family'), size: lit(26), weight: lit(500), color: bound('color.accent'), align: lit('left'), autoFit: null },
  { ...base({ id: 'headline', name: 'headline', rect: rect(112, 214, 856, 120) }), type: 'text', slot: 'headline', content: 'Как започваме', lang: 'bg', family: bound('type.display.family'), size: lit(60), weight: lit(500), color: bound('color.ink'), align: lit('left'), autoFit: null },
  { ...base({ id: 'divider', name: 'dot-divider', rect: rect(112, 372, 856, 32) }), type: 'chrome', component: 'dot-grid', params: { cols: lit(28), rows: lit(1), strokeWidth: lit(2) } },
  { ...base({ id: 'body', name: 'list', rect: rect(112, 450, 856, 780) }), type: 'text', slot: 'body', content: '01  Проучваме марката\n02  Събираме идеи\n03  Проектираме визия\n04  Публикуваме', lang: 'bg', family: bound('type.body.family'), size: lit(44), weight: lit(300), color: bound('color.ink'), align: lit('left'), autoFit: null, listStyle: 'numbered' },
])

const quote: Composition = comp('quiet-grid-quote', 'quiet-grid', [
  bg(),
  frameLayer(),
  { ...base({ id: 'qmark', name: 'quote-mark', rect: rect(112, 214, 190, 152) }), type: 'mark', packElementId: 'ref-quote-mark-accent', roleOverrides: {} },
  { ...base({ id: 'quote', name: 'quote', rect: rect(112, 400, 856, 480) }), type: 'text', slot: 'headline', content: 'Дизайнът е\nмълчалив посланик.', lang: 'bg', family: bound('type.display.family'), size: lit(76), weight: lit(400), color: bound('color.ink'), align: lit('left'), autoFit: { min: 48, max: 88 } },
  { ...base({ id: 'attr', name: 'attribution', rect: rect(112, 940, 856, 60) }), type: 'text', slot: 'caption', content: '— Пол Ранд', lang: 'bg', family: bound('type.body.family'), size: lit(32), weight: lit(500), color: bound('color.accent'), align: lit('left'), autoFit: null },
])

const cta: Composition = comp('quiet-grid-cta', 'quiet-grid', [
  bg(),
  frameLayer(),
  { ...base({ id: 'headline', name: 'headline', rect: rect(140, 470, 800, 360) }), type: 'text', slot: 'headline', content: 'Готови ли сте\nда започнем?', lang: 'bg', family: bound('type.display.family'), size: lit(84), weight: lit(400), color: bound('color.ink'), align: lit('center'), autoFit: { min: 50, max: 96 } },
  { ...base({ id: 'cta', name: 'cta', rect: rect(140, 860, 800, 70) }), type: 'text', slot: 'cta', content: 'Свържете се с нас →', lang: 'bg', family: bound('type.display.family'), size: lit(42), weight: lit(600), color: bound('color.accent'), align: lit('center'), autoFit: null },
  { ...base({ id: 'dots', name: 'dot-grid', rect: rect(450, 1180, 180, 50) }), type: 'chrome', component: 'dot-grid', params: { cols: lit(6), rows: lit(2), strokeWidth: lit(3) } },
])

export const QUIET_GRID_ARCHETYPES: Archetype[] = [
  archetype('quiet-grid-cover', 'opener', 'none', ['kicker', 'headline'], applyVAnchors(cover, { bg: 'fill', frame: 'stretch', headline: 'center', dots: 'bottom' })),
  archetype('quiet-grid-statement', 'content', 'none', ['headline'], applyVAnchors(statement, { bg: 'fill', rule: 'center', stmt: 'center' })),
  archetype('quiet-grid-list', 'content', 'none', ['kicker', 'headline', 'body'], applyVAnchors(list, { bg: 'fill', frame: 'stretch' })),
  archetype('quiet-grid-quote', 'content', 'none', ['headline', 'caption'], applyVAnchors(quote, { bg: 'fill', frame: 'stretch', quote: 'center', attr: 'bottom' })),
  archetype('quiet-grid-cta', 'closer', 'none', ['headline', 'cta'], applyVAnchors(cta, { bg: 'fill', frame: 'stretch', headline: 'center', cta: 'center', dots: 'bottom' })),
]

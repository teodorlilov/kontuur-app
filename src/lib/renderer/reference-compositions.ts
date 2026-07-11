import type { BlendMode, Binding, Clip, Composition, Rect } from '@/lib/scene-graph'

/**
 * The Phase-0 reference compositions (§2.7) — five roles covering a spread of layer types. They prove
 * the scene graph generalises, seed Phase 1's three starter feed systems, and are the fixtures the
 * in-container golden-snapshot test renders. Tokens only: no hex, no literal font families (they pass
 * `validateShareableComposition`). Content is Bulgarian to exercise Cyrillic + `locl`.
 */
const lit = <T>(value: T): Binding<T> => ({ mode: 'literal', value })
const bound = <T>(token: string): Binding<T> => ({ mode: 'bound', token })
const rect = (x: number, y: number, w: number, h: number, rotate = 0): Rect => ({ x, y, w, h, rotate })

function base(a: {
  id: string
  name: string
  rect: Rect
  opacity?: number
  blendMode?: BlendMode
  clip?: Clip
}) {
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

/** A sanitised, hand-authored quote mark (Phase 0 fixture; real packs arrive in Phase 2). */
export const REFERENCE_MARKS: Record<string, string> = {
  'ref-quote-mark':
    '<svg width="100%" height="100%" viewBox="0 0 100 80" xmlns="http://www.w3.org/2000/svg">' +
    '<path fill="var(--role-surface)" d="M0 80V44Q0 4 40 0V18Q20 20 20 40H40V80ZM60 80V44Q60 4 100 0V18Q80 20 80 40H100V80Z"/></svg>',
}

const cover: Composition = {
  id: 'ref-cover',
  feedSystemId: 'reference',
  brandKitVersion: 1,
  size: SIZE,
  layers: [
    { ...base({ id: 'bg', name: 'plate', rect: rect(0, 0, 1080, 1350) }), type: 'plate', source: 'generated', editHeadId: null, src: '', treatment: lit('none') },
    { ...base({ id: 'scrim', name: 'scrim', rect: rect(0, 0, 1080, 1350), opacity: 0.4 }), type: 'shape', shape: 'rect', fill: bound('color.ink') },
    { ...base({ id: 'kicker', name: 'kicker', rect: rect(96, 128, 888, 60) }), type: 'text', slot: 'kicker', content: 'ЗА СОЦИАЛНИТЕ МРЕЖИ', lang: 'bg', family: bound('type.display.family'), size: lit(30), weight: lit(600), color: bound('color.surface'), align: lit('left'), autoFit: null },
    { ...base({ id: 'headline', name: 'headline', rect: rect(96, 720, 888, 470) }), type: 'text', slot: 'headline', content: 'Съдържание, което\nхората помнят', lang: 'bg', family: bound('type.display.family'), size: lit(108), weight: lit(700), color: bound('color.surface'), align: lit('left'), autoFit: { min: 64, max: 120 } },
    { ...base({ id: 'dots', name: 'index', rect: rect(96, 1244, 240, 20) }), type: 'chrome', component: 'index-dots', params: { count: lit(5), active: lit(0) } },
  ],
}

const statement: Composition = {
  id: 'ref-statement',
  feedSystemId: 'reference',
  brandKitVersion: 1,
  size: SIZE,
  layers: [
    { ...base({ id: 'bg', name: 'plate', rect: rect(0, 0, 1080, 1350) }), type: 'plate', source: 'generated', editHeadId: null, src: '', treatment: lit('none') },
    { ...base({ id: 'blend', name: 'blend', rect: rect(140, 300, 800, 750), blendMode: 'multiply', clip: { kind: 'rect', radius: 32 } }), type: 'shape', shape: 'rect', fill: bound('color.accent-deep') },
    { ...base({ id: 'stmt', name: 'statement', rect: rect(140, 470, 800, 410) }), type: 'text', slot: 'headline', content: 'По-малко шум.\nПовече смисъл.', lang: 'bg', family: bound('type.display.family'), size: lit(92), weight: lit(700), color: bound('color.surface'), align: lit('center'), autoFit: { min: 56, max: 104 } },
  ],
}

const list: Composition = {
  id: 'ref-list',
  feedSystemId: 'reference',
  brandKitVersion: 1,
  size: SIZE,
  layers: [
    { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350) }), type: 'shape', shape: 'rect', fill: bound('color.surface') },
    { ...base({ id: 'kicker', name: 'kicker', rect: rect(96, 128, 888, 50) }), type: 'text', slot: 'kicker', content: 'СТЪПКИ', lang: 'bg', family: bound('type.display.family'), size: lit(28), weight: lit(600), color: bound('color.accent'), align: lit('left'), autoFit: null },
    { ...base({ id: 'headline', name: 'headline', rect: rect(96, 190, 888, 140) }), type: 'text', slot: 'headline', content: 'Как започваме', lang: 'bg', family: bound('type.display.family'), size: lit(72), weight: lit(700), color: bound('color.ink'), align: lit('left'), autoFit: null },
    { ...base({ id: 'rule', name: 'rule', rect: rect(96, 360, 888, 20) }), type: 'chrome', component: 'rule', params: { strokeWidth: lit(2) } },
    { ...base({ id: 'body', name: 'list', rect: rect(96, 430, 888, 760) }), type: 'text', slot: 'body', content: '01  Проучваме марката\n02  Събираме идеи\n03  Проектираме визия\n04  Публикуваме', lang: 'bg', family: bound('type.body.family'), size: lit(46), weight: lit(400), color: bound('color.ink'), align: lit('left'), autoFit: null },
  ],
}

const quote: Composition = {
  id: 'ref-quote',
  feedSystemId: 'reference',
  brandKitVersion: 1,
  size: SIZE,
  layers: [
    { ...base({ id: 'bg', name: 'bg', rect: rect(0, 0, 1080, 1350) }), type: 'shape', shape: 'rect', fill: bound('color.accent') },
    { ...base({ id: 'qmark', name: 'quote-mark', rect: rect(96, 150, 180, 144) }), type: 'mark', packElementId: 'ref-quote-mark', roleOverrides: {} },
    { ...base({ id: 'quote', name: 'quote', rect: rect(96, 380, 888, 500) }), type: 'text', slot: 'headline', content: 'Дизайнът е\nмълчалив посланик.', lang: 'bg', family: bound('type.display.family'), size: lit(84), weight: lit(700), color: bound('color.surface'), align: lit('left'), autoFit: { min: 52, max: 96 } },
    { ...base({ id: 'attr', name: 'attribution', rect: rect(96, 940, 888, 60) }), type: 'text', slot: 'caption', content: '— Пол Ранд', lang: 'bg', family: bound('type.body.family'), size: lit(34), weight: lit(400), color: bound('color.surface'), align: lit('left'), autoFit: null },
  ],
}

const cta: Composition = {
  id: 'ref-cta',
  feedSystemId: 'reference',
  brandKitVersion: 1,
  size: SIZE,
  layers: [
    { ...base({ id: 'bg', name: 'plate', rect: rect(0, 0, 1080, 1350) }), type: 'plate', source: 'generated', editHeadId: null, src: '', treatment: lit('none') },
    { ...base({ id: 'headline', name: 'headline', rect: rect(96, 430, 888, 360) }), type: 'text', slot: 'headline', content: 'Готови ли сте\nда започнем?', lang: 'bg', family: bound('type.display.family'), size: lit(96), weight: lit(700), color: bound('color.surface'), align: lit('center'), autoFit: { min: 56, max: 108 } },
    { ...base({ id: 'cta', name: 'cta', rect: rect(96, 820, 888, 80) }), type: 'text', slot: 'cta', content: 'Свържете се с нас →', lang: 'bg', family: bound('type.display.family'), size: lit(44), weight: lit(600), color: bound('color.surface'), align: lit('center'), autoFit: null },
    { ...base({ id: 'arc', name: 'arc', rect: rect(760, 120, 224, 224) }), type: 'chrome', component: 'arc', params: { strokeWidth: lit(3) } },
  ],
}

export type ReferenceRole = 'cover' | 'statement' | 'list' | 'quote' | 'cta'

export const REFERENCE_COMPOSITIONS: Record<ReferenceRole, Composition> = { cover, statement, list, quote, cta }

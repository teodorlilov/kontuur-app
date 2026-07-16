import { describe, expect, it } from 'vitest'
import type { ChromeLayer, Composition, PlateLayer, Rect, ShapeLayer, TextLayer } from '../types'
import {
  addLayer,
  clampRectToCanvas,
  findLayer,
  removeLayer,
  selectableLayers,
  setChromeParam,
  setLayerRect,
  setLayerRotation,
  setLayerSize,
  setPlateSrc,
  setPlateTreatment,
  setShapeFillRole,
  setTextContent,
  updateLayer,
  updateTextStyle,
} from '../edit'

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h, rotate: 0 })
const lit = <T>(value: T) => ({ mode: 'literal' as const, value })

function textLayer(id: string, extra: Partial<TextLayer> = {}): TextLayer {
  return {
    id, name: id, locked: false, hidden: false, rect: rect(0, 0, 100, 40),
    opacity: lit(1), blendMode: lit('normal'), clip: { kind: 'none' },
    type: 'text', slot: 'headline', content: 'Hi', lang: 'en',
    family: { mode: 'bound', token: 'type.display.family' }, size: lit(48), weight: lit(700),
    color: { mode: 'bound', token: 'color.ink' }, align: lit('left'), autoFit: null, ...extra,
  }
}

const comp = (layers: Composition['layers']): Composition => ({
  id: 'c', feedSystemId: 'editorial', brandKitVersion: 1, size: { w: 1080, h: 1350 }, layers,
})

describe('selectableLayers', () => {
  it('excludes locked and hidden layers', () => {
    const c = comp([textLayer('a'), textLayer('b', { locked: true }), textLayer('c', { hidden: true })])
    expect(selectableLayers(c).map((l) => l.id)).toEqual(['a'])
  })
})

describe('findLayer / updateLayer / setLayerRect', () => {
  it('finds by id', () => {
    const c = comp([textLayer('a'), textLayer('b')])
    expect(findLayer(c, 'b')?.id).toBe('b')
    expect(findLayer(c, 'z')).toBeUndefined()
  })

  it('setLayerRect replaces only the target layer, immutably', () => {
    const c = comp([textLayer('a'), textLayer('b')])
    const next = setLayerRect(c, 'a', rect(10, 20, 200, 80))
    expect(next).not.toBe(c)
    expect(findLayer(next, 'a')?.rect).toEqual(rect(10, 20, 200, 80))
    expect(findLayer(next, 'b')?.rect).toEqual(rect(0, 0, 100, 40)) // untouched
    expect(findLayer(c, 'a')?.rect).toEqual(rect(0, 0, 100, 40)) // original not mutated
  })

  it('updateLayer is a no-op for an unknown id', () => {
    const c = comp([textLayer('a')])
    expect(updateLayer(c, 'z', (l) => ({ ...l, locked: true })).layers).toEqual(c.layers)
  })
})

describe('clampRectToCanvas', () => {
  const size = { w: 1080, h: 1350 }
  it('leaves an in-bounds rect unchanged', () => {
    expect(clampRectToCanvas(rect(100, 100, 200, 200), size)).toEqual(rect(100, 100, 200, 200))
  })

  it('keeps at least `margin` on-canvas when dragged past the left/top', () => {
    const r = clampRectToCanvas(rect(-500, -500, 200, 200), size, 48)
    expect(r.x).toBe(48 - 200) // -152: 48px of the box still on-canvas
    expect(r.y).toBe(48 - 200)
  })

  it('keeps at least `margin` on-canvas when dragged past the right/bottom', () => {
    const r = clampRectToCanvas(rect(5000, 5000, 200, 200), size, 48)
    expect(r.x).toBe(1080 - 48)
    expect(r.y).toBe(1350 - 48)
  })
})

describe('setTextContent', () => {
  it('updates a text layer content', () => {
    const c = comp([textLayer('a', { content: 'old' })])
    expect((findLayer(setTextContent(c, 'a', 'new'), 'a') as TextLayer).content).toBe('new')
  })

  it('is a no-op on a non-text layer', () => {
    const c = comp([shapeLayer('s')])
    expect(setTextContent(c, 's', 'x').layers[0]).toEqual(shapeLayer('s'))
  })
})

const shapeLayer = (id: string): ShapeLayer => ({
  id, name: id, locked: false, hidden: false, rect: rect(0, 0, 10, 10),
  opacity: lit(1), blendMode: lit('normal'), clip: { kind: 'none' },
  type: 'shape', shape: 'rect', fill: { mode: 'bound', token: 'color.accent' },
})

const plateLayer = (id: string): PlateLayer => ({
  id, name: id, locked: false, hidden: false, rect: rect(0, 0, 100, 100),
  opacity: lit(1), blendMode: lit('normal'), clip: { kind: 'none' },
  type: 'plate', source: 'generated', editHeadId: null, src: '', treatment: lit('duotone'),
})

describe('addLayer / removeLayer', () => {
  it('appends on top and removes by id, immutably', () => {
    const c = comp([textLayer('a')])
    const added = addLayer(c, shapeLayer('b'))
    expect(added.layers.map((l) => l.id)).toEqual(['a', 'b']) // b on top (painted last)
    expect(c.layers).toHaveLength(1) // original untouched
    expect(removeLayer(added, 'a').layers.map((l) => l.id)).toEqual(['b'])
    expect(removeLayer(added, 'zzz').layers).toHaveLength(2) // unknown id: no-op
  })
})

describe('setLayerRotation / setLayerSize', () => {
  it('rotates around the layer, keeping position and size', () => {
    const next = setLayerRotation(comp([textLayer('a')]), 'a', 15)
    expect(findLayer(next, 'a')?.rect).toEqual({ x: 0, y: 0, w: 100, h: 40, rotate: 15 })
  })

  it('resizes with a 1px floor, keeping position', () => {
    const next = setLayerSize(comp([textLayer('a', { rect: rect(10, 20, 100, 40) })]), 'a', 250, 0)
    expect(findLayer(next, 'a')?.rect).toEqual({ x: 10, y: 20, w: 250, h: 1, rotate: 0 })
  })
})

describe('updateTextStyle', () => {
  it('sets literal size/weight/align and binds colour to a brand role', () => {
    const next = updateTextStyle(comp([textLayer('a')]), 'a', { size: 72, weight: 900, align: 'center', colorRole: 'accent' })
    const t = findLayer(next, 'a') as TextLayer
    expect(t.size).toEqual({ mode: 'literal', value: 72 })
    expect(t.weight).toEqual({ mode: 'literal', value: 900 })
    expect(t.align).toEqual({ mode: 'literal', value: 'center' })
    expect(t.color).toEqual({ mode: 'bound', token: 'color.accent' })
  })

  it('only patches the fields given, floors size at 1, and no-ops off text', () => {
    const t = findLayer(updateTextStyle(comp([textLayer('a')]), 'a', { size: 0 }), 'a') as TextLayer
    expect(t.size).toEqual({ mode: 'literal', value: 1 })
    expect(t.weight).toEqual({ mode: 'literal', value: 700 }) // untouched
    expect(updateTextStyle(comp([shapeLayer('s')]), 's', { size: 40 }).layers[0]).toEqual(shapeLayer('s'))
  })
})

describe('setPlateTreatment / setShapeFillRole', () => {
  it('sets a plate treatment', () => {
    const p = findLayer(setPlateTreatment(comp([plateLayer('p')]), 'p', 'mono'), 'p') as PlateLayer
    expect(p.treatment).toEqual({ mode: 'literal', value: 'mono' })
  })

  it('binds a shape fill to a role', () => {
    const s = findLayer(setShapeFillRole(comp([shapeLayer('s')]), 's', 'ink'), 's') as ShapeLayer
    expect(s.fill).toEqual({ mode: 'bound', token: 'color.ink' })
  })

  it('setPlateSrc points a plate at a new image, no-op off plate', () => {
    const p = findLayer(setPlateSrc(comp([plateLayer('p')]), 'p', 'https://x/y.jpg'), 'p') as PlateLayer
    expect(p.src).toBe('https://x/y.jpg')
    expect(setPlateSrc(comp([shapeLayer('s')]), 's', 'x').layers[0]).toEqual(shapeLayer('s'))
  })

  it('each is a no-op on the wrong layer type', () => {
    expect(setPlateTreatment(comp([shapeLayer('s')]), 's', 'mono').layers[0]).toEqual(shapeLayer('s'))
    expect(setShapeFillRole(comp([plateLayer('p')]), 'p', 'ink').layers[0]).toEqual(plateLayer('p'))
  })
})

const chromeLayer = (id: string): ChromeLayer => ({
  id, name: id, locked: false, hidden: false, rect: rect(0, 0, 100, 20),
  opacity: lit(1), blendMode: lit('normal'), clip: { kind: 'none' },
  type: 'chrome', component: 'rule', params: { strokeWidth: lit(2) },
})

describe('setChromeParam', () => {
  it('sets a numeric chrome param as a literal', () => {
    const out = setChromeParam(comp([chromeLayer('r')]), 'r', 'strokeWidth', 6)
    const params = (findLayer(out, 'r') as unknown as { params: Record<string, unknown> }).params
    expect(params.strokeWidth).toEqual({ mode: 'literal', value: 6 })
  })

  it('is a no-op on a non-chrome layer', () => {
    expect(setChromeParam(comp([shapeLayer('s')]), 's', 'strokeWidth', 6).layers[0]).toEqual(shapeLayer('s'))
  })
})

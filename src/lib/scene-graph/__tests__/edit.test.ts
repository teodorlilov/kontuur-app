import { describe, expect, it } from 'vitest'
import type { Composition, Rect, TextLayer } from '../types'
import { clampRectToCanvas, findLayer, selectableLayers, setLayerRect, setTextContent, updateLayer } from '../edit'

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
    const shape: Composition['layers'][number] = {
      id: 's', name: 's', locked: false, hidden: false, rect: rect(0, 0, 10, 10),
      opacity: lit(1), blendMode: lit('normal'), clip: { kind: 'none' },
      type: 'shape', shape: 'rect', fill: { mode: 'bound', token: 'color.accent' },
    }
    const c = comp([shape])
    expect(setTextContent(c, 's', 'x').layers[0]).toEqual(shape)
  })
})

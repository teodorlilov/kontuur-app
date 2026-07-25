import { describe, expect, it } from 'vitest'
import type { CanvasTextLayer } from '@/types/canvas'
import { textGroupAttrs, textNodeAttrs } from '../node-attrs'

function makeLayer(overrides?: Partial<CanvasTextLayer>): CanvasTextLayer {
  return {
    id: 'l1',
    role: 'headline',
    text: 'Hello there',
    x: 96,
    y: 128,
    width: 888,
    fontFamily: 'Playfair Display',
    fontSize: 88,
    fontWeight: 400,
    fill: '#111111',
    align: 'left',
    lineHeight: 1.1,
    ...overrides,
  }
}

describe('textNodeAttrs', () => {
  it('composes fontStyle from weight and italic', () => {
    expect(textNodeAttrs(makeLayer()).fontStyle).toBe('normal')
    expect(textNodeAttrs(makeLayer({ fontWeight: 700 })).fontStyle).toBe('bold')
    expect(textNodeAttrs(makeLayer({ fontWeight: 500 })).fontStyle).toBe('500')
    expect(textNodeAttrs(makeLayer({ italic: true })).fontStyle).toBe('italic')
    expect(textNodeAttrs(makeLayer({ italic: true, fontWeight: 700 })).fontStyle).toBe('italic bold')
    expect(textNodeAttrs(makeLayer({ italic: true, fontWeight: 500 })).fontStyle).toBe('italic 500')
  })

  it('applies uppercase to the drawn string only', () => {
    expect(textNodeAttrs(makeLayer({ uppercase: true })).text).toBe('HELLO THERE')
    expect(textNodeAttrs(makeLayer()).text).toBe('Hello there')
  })

  it('carries no position — that lives on the group', () => {
    const attrs = textNodeAttrs(makeLayer())
    expect('x' in attrs).toBe(false)
    expect('y' in attrs).toBe(false)
    expect('rotation' in attrs).toBe(false)
  })
})

describe('textGroupAttrs', () => {
  it('exposes the layer position with rotation defaulting to 0', () => {
    expect(textGroupAttrs(makeLayer())).toEqual({ x: 96, y: 128, rotation: 0 })
    expect(textGroupAttrs(makeLayer({ rotation: -12 })).rotation).toBe(-12)
  })
})

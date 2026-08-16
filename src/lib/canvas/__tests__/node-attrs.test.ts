import { describe, expect, it } from 'vitest'
import type { CanvasImageNode, CanvasShapeNode, CanvasTextNode } from '@/types/canvas'
import {
  imageBitmapAttrs,
  nodeGroupAttrs,
  shapeChildAttrs,
  textGroupAttrs,
  textNodeAttrs,
} from '../node-attrs'

function makeLayer(overrides?: Partial<CanvasTextNode>): CanvasTextNode {
  return {
    id: 'l1',
    kind: 'text',
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

describe('imageBitmapAttrs — the mirror', () => {
  const asset = (overrides?: Partial<CanvasImageNode>): CanvasImageNode => ({
    id: 'e1',
    kind: 'image',
    src: { publicUrl: 'https://x.test/a.png', storagePath: 'c/p/a.png' },
    x: 100,
    y: 200,
    width: 300,
    height: 150,
    ...overrides,
  })

  it('is the identity when neither flip is set', () => {
    expect(imageBitmapAttrs(asset())).toEqual({
      width: 300,
      height: 150,
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0,
    })
  })

  it('puts the pivot on the FAR edge, so the flip stays inside the node box', () => {
    // Konva maps a local point u to x + scale*(u - offset). With scale -1 and offset = width that
    // is x + (width - u), which folds [0,width] onto itself: the node does not move.
    const flipped = imageBitmapAttrs(asset({ flipX: true }))
    expect(flipped.scaleX).toBe(-1)
    expect(flipped.offsetX).toBe(300)
    const mapX = (u: number) => 100 + flipped.scaleX * (u - flipped.offsetX)
    expect(mapX(0)).toBe(400)
    expect(mapX(300)).toBe(100)
    // Both box edges land on the unflipped box's edges — swapped, not shifted.
    expect([mapX(0), mapX(300)].sort((a, b) => a - b)).toEqual([100, 400])
  })

  it('mirrors vertically on the same rule', () => {
    const flipped = imageBitmapAttrs(asset({ flipY: true }))
    expect(flipped).toMatchObject({ scaleY: -1, offsetY: 150, scaleX: 1, offsetX: 0 })
  })

  it('composes both axes', () => {
    expect(imageBitmapAttrs(asset({ flipX: true, flipY: true }))).toMatchObject({
      scaleX: -1,
      scaleY: -1,
      offsetX: 300,
      offsetY: 150,
    })
  })

  it('is total — an unflipped node still states scale and offset, so nothing can go stale', () => {
    // Returned unconditionally rather than spread-when-set: the stage and the offscreen exporter
    // read this same function, and a conditionally-absent attr is how the two drift.
    expect(Object.keys(imageBitmapAttrs(asset())).sort()).toEqual([
      'height',
      'offsetX',
      'offsetY',
      'scaleX',
      'scaleY',
      'width',
    ])
  })
})

describe('nodeGroupAttrs — the transform target', () => {
  it('carries position, rotation and opacity, and never a scale', () => {
    const attrs = nodeGroupAttrs({
      id: 'e1',
      kind: 'image',
      src: { publicUrl: 'https://x.test/a.png', storagePath: 'c/p/a.png' },
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      rotation: 37,
      opacity: 0.4,
      flipX: true,
    })
    // No scale here BY DESIGN: Konva's Transformer decomposes its gesture back onto this node, and
    // that decomposition cannot express a mirror as a negative scaleX — it would come back as a
    // negative scaleY plus a 180° rotation, and the size fold would then collapse the node.
    expect(attrs).toEqual({ x: 10, y: 20, rotation: 37, opacity: 0.4 })
  })

  it('defaults rotation and opacity when the node omits them', () => {
    const attrs = nodeGroupAttrs({
      id: 'e1',
      kind: 'svg',
      src: { publicUrl: 'https://x.test/a.svg', storagePath: 'c/p/a.svg' },
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    })
    expect(attrs).toEqual({ x: 0, y: 0, rotation: 0, opacity: 1 })
  })
})

describe('shapeChildAttrs', () => {
  const shape = (overrides: Partial<CanvasShapeNode> & Pick<CanvasShapeNode, 'kind'>): CanvasShapeNode => ({
    id: 's1',
    x: 100,
    y: 200,
    width: 300,
    height: 150,
    ...overrides,
  })

  it('draws a rect at the box, with no offset', () => {
    expect(shapeChildAttrs(shape({ kind: 'rect', fill: '#112233' }))).toMatchObject({
      width: 300,
      height: 150,
      offsetX: 0,
      offsetY: 0,
      fill: '#112233',
    })
  })

  it('offsets an ellipse by half its box, so x/y still mean the box top-left', () => {
    // Konva draws an Ellipse from its CENTRE. Without this offset a shape's x/y would mean
    // something different from every other kind, and snapping, the marquee and the layers list
    // would all disagree about where the node is.
    const attrs = shapeChildAttrs(shape({ kind: 'ellipse', fill: '#112233' }))
    expect(attrs.offsetX).toBe(-150)
    expect(attrs.offsetY).toBe(-75)
  })

  it('gives a line the box top edge and no fill — a line has no interior', () => {
    const attrs = shapeChildAttrs(shape({ kind: 'line', stroke: '#112233', strokeWidth: 6 }))
    expect(attrs.points).toEqual([0, 0, 300, 0])
    expect(attrs.fill).toBeUndefined()
    expect(attrs.strokeWidth).toBe(6)
  })

  it('drops a fill set on a line rather than drawing one', () => {
    expect(shapeChildAttrs(shape({ kind: 'line', fill: '#ff0000' })).fill).toBeUndefined()
  })

  it('applies cornerRadius only to a rect', () => {
    expect(shapeChildAttrs(shape({ kind: 'rect', cornerRadius: 24 })).cornerRadius).toBe(24)
    expect(shapeChildAttrs(shape({ kind: 'ellipse', cornerRadius: 24 })).cornerRadius).toBe(0)
  })

  it('is total — every attr is stated, so the stage and the exporter cannot drift', () => {
    expect(Object.keys(shapeChildAttrs(shape({ kind: 'rect' }))).sort()).toEqual([
      'cornerRadius',
      'fill',
      'height',
      'offsetX',
      'offsetY',
      'points',
      'stroke',
      'strokeWidth',
      'width',
    ])
  })
})

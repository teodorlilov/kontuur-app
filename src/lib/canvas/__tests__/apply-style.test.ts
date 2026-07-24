import { describe, it, expect } from 'vitest'
import { applyStyleToDoc } from '../apply-style'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants'
import type { CanvasDoc, CanvasTextLayer } from '@/types/canvas'

function makeLayer(overrides: Partial<CanvasTextLayer> & Pick<CanvasTextLayer, 'id' | 'role' | 'text'>): CanvasTextLayer {
  return {
    x: 96,
    y: 128,
    width: 888,
    fontFamily: 'Oswald',
    fontSize: 88,
    fontWeight: 700,
    fill: '#111111',
    align: 'left',
    lineHeight: 1.1,
    ...overrides,
  }
}

function makeDoc(layers: CanvasTextLayer[], overrides?: Partial<CanvasDoc>): CanvasDoc {
  return {
    version: 1,
    canvas: { w: CANVAS_WIDTH, h: CANVAS_HEIGHT },
    background: { publicUrl: 'https://cdn/x.jpg', storagePath: 'client/post/x.jpg' },
    flattenedStoragePath: null,
    scrim: { enabled: true, color: '#ffffff', opacity: 0.35, mode: 'bottom' },
    layers,
    ...overrides,
  }
}

const styledSource = makeDoc(
  [
    makeLayer({ id: 's-h', role: 'headline', text: 'SOURCE HEAD', x: 60, y: 900, width: 700, fontFamily: 'Playfair Display', fontSize: 64, fontWeight: 500, fill: '#C07B55', align: 'center', lineHeight: 1.25 }),
    makeLayer({ id: 's-b', role: 'body', text: 'Source body', y: 1100, fontFamily: 'Commissioner', fontSize: 36, fontWeight: 400 }),
  ],
  { scrim: { enabled: false, color: '#000000', opacity: 0.6, mode: 'full' } }
)

describe('applyStyleToDoc', () => {
  it('copies role-matched layer style and the scrim, keeping the target text', () => {
    const target = makeDoc([
      makeLayer({ id: 't-h', role: 'headline', text: 'TARGET HEAD' }),
      makeLayer({ id: 't-b', role: 'body', text: 'Target body', y: 760, fontSize: 44, fontWeight: 400 }),
    ])
    const result = applyStyleToDoc(target, styledSource)

    const headline = result.layers[0]
    expect(headline).toMatchObject({
      id: 't-h',
      text: 'TARGET HEAD',
      x: 60,
      y: 900,
      width: 700,
      fontFamily: 'Playfair Display',
      fontSize: 64,
      fontWeight: 500,
      fill: '#C07B55',
      align: 'center',
      lineHeight: 1.25,
    })
    expect(result.layers[1]).toMatchObject({ id: 't-b', text: 'Target body', fontFamily: 'Commissioner', y: 1100 })
    expect(result.scrim).toEqual({ enabled: false, color: '#000000', opacity: 0.6, mode: 'full' })
  })

  it('leaves the target background, flattenedStoragePath and textOverridden untouched', () => {
    const target = makeDoc(
      [makeLayer({ id: 't-h', role: 'headline', text: 'Custom wording', textOverridden: true })],
      { flattenedStoragePath: 'client/post/flat.jpg' }
    )
    const result = applyStyleToDoc(target, styledSource)
    expect(result.background).toEqual(target.background)
    expect(result.flattenedStoragePath).toBe('client/post/flat.jpg')
    expect(result.layers[0]?.text).toBe('Custom wording')
    expect(result.layers[0]?.textOverridden).toBe(true)
  })

  it('never touches custom layers and never creates missing roles', () => {
    const target = makeDoc([
      makeLayer({ id: 't-h', role: 'headline', text: 'Head only' }),
      makeLayer({ id: 't-c', role: 'custom', text: 'Sticker note', fontFamily: 'Caveat', fontSize: 40 }),
    ])
    const result = applyStyleToDoc(target, styledSource)
    expect(result.layers).toHaveLength(2)
    expect(result.layers[1]).toEqual(target.layers[1])
  })

  it('leaves a target role alone when the source lacks it', () => {
    const sourceHeadlineOnly = makeDoc([makeLayer({ id: 's-h', role: 'headline', text: 'Head', fill: '#00ff00' })])
    const target = makeDoc([
      makeLayer({ id: 't-h', role: 'headline', text: 'T head' }),
      makeLayer({ id: 't-b', role: 'body', text: 'T body', fill: '#123456' }),
    ])
    const result = applyStyleToDoc(target, sourceHeadlineOnly)
    expect(result.layers[0]?.fill).toBe('#00ff00')
    expect(result.layers[1]).toEqual(target.layers[1])
  })
})

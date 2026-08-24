import { describe, it, expect } from 'vitest'
import { applyStyleToDoc } from '../apply-style'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants'
import type { CanvasDoc, CanvasImageNode, CanvasNode, CanvasTextNode } from '@/types/canvas'

function makeText(
  overrides: Partial<CanvasTextNode> & Pick<CanvasTextNode, 'id' | 'role' | 'text'>
): CanvasTextNode {
  return {
    kind: 'text',
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

function makeDoc(nodes: CanvasNode[], overrides?: Partial<CanvasDoc>): CanvasDoc {
  return {
    version: 2,
    canvas: { w: CANVAS_WIDTH, h: CANVAS_HEIGHT },
    background: { publicUrl: 'https://cdn/x.jpg', storagePath: 'client/post/x.jpg' },
    flattenedStoragePath: null,
    backdrop: { enabled: true, color: '#ffffff', opacity: 0.35 },
    nodes,
    ...overrides,
  }
}

// applyStyleToDoc returns the union type; assertions on text fields go through this.
function textAt(doc: CanvasDoc, index: number): CanvasTextNode {
  const node = doc.nodes[index]
  if (!node || node.kind !== 'text') throw new Error(`node ${index} is not text`)
  return node
}

const styledSource = makeDoc(
  [
    makeText({
      id: 's-h',
      role: 'headline',
      text: 'SOURCE HEAD',
      x: 60,
      y: 900,
      width: 700,
      fontFamily: 'Playfair Display',
      fontSize: 64,
      fontWeight: 500,
      fill: '#C07B55',
      align: 'center',
      lineHeight: 1.25,
    }),
    makeText({
      id: 's-b',
      role: 'body',
      text: 'Source body',
      y: 1100,
      fontFamily: 'Commissioner',
      fontSize: 36,
      fontWeight: 400,
    }),
  ],
  { backdrop: { enabled: false, color: '#000000', opacity: 0.6 } }
)

describe('applyStyleToDoc', () => {
  it('copies role-matched layer style and the backdrop, keeping the target text', () => {
    const target = makeDoc([
      makeText({ id: 't-h', role: 'headline', text: 'TARGET HEAD' }),
      makeText({
        id: 't-b',
        role: 'body',
        text: 'Target body',
        y: 760,
        fontSize: 44,
        fontWeight: 400,
      }),
    ])
    const result = applyStyleToDoc(target, styledSource)

    const headline = result.nodes[0]
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
    expect(result.nodes[1]).toMatchObject({
      id: 't-b',
      text: 'Target body',
      fontFamily: 'Commissioner',
      y: 1100,
    })
    expect(result.backdrop).toEqual({ enabled: false, color: '#000000', opacity: 0.6 })
  })

  it('leaves the target background, flattenedStoragePath and textOverridden untouched', () => {
    const target = makeDoc(
      [makeText({ id: 't-h', role: 'headline', text: 'Custom wording', textOverridden: true })],
      { flattenedStoragePath: 'client/post/flat.jpg' }
    )
    const result = applyStyleToDoc(target, styledSource)
    expect(result.background).toEqual(target.background)
    expect(result.flattenedStoragePath).toBe('client/post/flat.jpg')
    expect(textAt(result, 0).text).toBe('Custom wording')
    expect(textAt(result, 0).textOverridden).toBe(true)
  })

  it('never touches custom layers and never creates missing roles', () => {
    const target = makeDoc([
      makeText({ id: 't-h', role: 'headline', text: 'Head only' }),
      makeText({
        id: 't-c',
        role: 'custom',
        text: 'Sticker note',
        fontFamily: 'Caveat',
        fontSize: 40,
      }),
    ])
    const result = applyStyleToDoc(target, styledSource)
    expect(result.nodes).toHaveLength(2)
    expect(result.nodes[1]).toEqual(target.nodes[1])
  })

  it('copies rotation as part of the look, and an unrotated source un-tilts the target', () => {
    const tiltedSource = makeDoc([
      makeText({ id: 's-h', role: 'headline', text: 'Head', rotation: -6 }),
    ])
    const target = makeDoc([
      makeText({ id: 't-h', role: 'headline', text: 'T head', rotation: 45 }),
    ])
    expect(textAt(applyStyleToDoc(target, tiltedSource), 0).rotation).toBe(-6)
    const straightSource = makeDoc([makeText({ id: 's-h', role: 'headline', text: 'Head' })])
    expect(textAt(applyStyleToDoc(target, straightSource), 0).rotation).toBeUndefined()
  })

  it('copies italic + highlight as part of the look, and their absence clears the target', () => {
    const source = makeDoc([
      makeText({ id: 's-h', role: 'headline', text: 'Head', italic: true, highlight: '#D6FF4B' }),
    ])
    const target = makeDoc([makeText({ id: 't-h', role: 'headline', text: 'T head' })])
    const styled = textAt(applyStyleToDoc(target, source), 0)
    expect(styled.italic).toBe(true)
    expect(styled.highlight).toBe('#D6FF4B')
    const plainSource = makeDoc([makeText({ id: 's-h', role: 'headline', text: 'Head' })])
    const decorated = makeDoc([
      makeText({ id: 't-h', role: 'headline', text: 'T', italic: true, highlight: '#D6FF4B' }),
    ])
    const cleared = textAt(applyStyleToDoc(decorated, plainSource), 0)
    expect(cleared.italic).toBeUndefined()
    expect(cleared.highlight).toBeUndefined()
  })

  it('never touches placed pictures — they are content, not style, and keep their z-position', () => {
    const picture: CanvasImageNode = {
      id: 'el-1',
      kind: 'image',
      src: { publicUrl: 'https://cdn/logo.png', storagePath: 'client/post/logo.png' },
      x: 50,
      y: 60,
      width: 200,
      height: 100,
    }
    const source = makeDoc([makeText({ id: 's-h', role: 'headline', text: 'Head' })])
    // The picture sits ABOVE the text: styling must not quietly restack it.
    const target = makeDoc([makeText({ id: 't-h', role: 'headline', text: 'T head' }), picture])
    const result = applyStyleToDoc(target, source)
    expect(result.nodes[1]).toEqual(picture)
    expect(result.nodes.map((node) => node.id)).toEqual(['t-h', 'el-1'])
  })

  it('never copies the background transform — the crop belongs to each slide', () => {
    const source = makeDoc([makeText({ id: 's-h', role: 'headline', text: 'Head' })], {
      backgroundTransform: { zoom: 2, offsetX: 0.1, offsetY: 0.9 },
    })
    const target = makeDoc([makeText({ id: 't-h', role: 'headline', text: 'T head' })], {
      backgroundTransform: { zoom: 1.5, offsetX: 0.7, offsetY: 0.3 },
    })
    expect(applyStyleToDoc(target, source).backgroundTransform).toEqual({
      zoom: 1.5,
      offsetX: 0.7,
      offsetY: 0.3,
    })
  })

  it('leaves a target role alone when the source lacks it', () => {
    const sourceHeadlineOnly = makeDoc([
      makeText({ id: 's-h', role: 'headline', text: 'Head', fill: '#00ff00' }),
    ])
    const target = makeDoc([
      makeText({ id: 't-h', role: 'headline', text: 'T head' }),
      makeText({ id: 't-b', role: 'body', text: 'T body', fill: '#123456' }),
    ])
    const result = applyStyleToDoc(target, sourceHeadlineOnly)
    expect(textAt(result, 0).fill).toBe('#00ff00')
    expect(result.nodes[1]).toEqual(target.nodes[1])
  })
})

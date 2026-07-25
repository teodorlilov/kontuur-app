import { describe, expect, it } from 'vitest'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants'
import { canvasPointToElementLocal, createCenteredElement } from '../elements'

const CANVAS = { w: CANVAS_WIDTH, h: CANVAS_HEIGHT }
const SRC = { publicUrl: 'https://cdn/a.png', storagePath: 'c1/p1/a.png' }

describe('createCenteredElement', () => {
  it('centers the element at the default width, preserving the asset aspect', () => {
    const element = createCenteredElement('image', SRC, { width: 840, height: 420 }, CANVAS)
    expect(element.width).toBe(420)
    expect(element.height).toBe(210)
    expect(element.x).toBe((CANVAS_WIDTH - 420) / 2)
    expect(element.y).toBe((CANVAS_HEIGHT - 210) / 2)
    expect(element.kind).toBe('image')
    expect(element.src).toEqual(SRC)
    expect(element.id).toBeTruthy()
  })

  it('survives a zero-width natural size without dividing by zero', () => {
    const element = createCenteredElement('svg', SRC, { width: 0, height: 100 }, CANVAS)
    expect(Number.isFinite(element.height)).toBe(true)
  })
})

describe('canvasPointToElementLocal', () => {
  const natural = { width: 800, height: 400 }

  it('maps an unrotated element: translate then scale display → natural', () => {
    const element = { x: 100, y: 200, width: 400, height: 200, rotation: undefined }
    expect(canvasPointToElementLocal({ x: 100, y: 200 }, element, natural)).toEqual({ x: 0, y: 0 })
    const center = canvasPointToElementLocal({ x: 300, y: 300 }, element, natural)
    expect(center.x).toBeCloseTo(400, 6)
    expect(center.y).toBeCloseTo(200, 6)
  })

  it('undoes a 90° rotation around the top-left pivot', () => {
    const element = { x: 100, y: 100, width: 400, height: 200, rotation: 90 }
    // At 90°, the element's local +x axis points down in canvas space: the canvas point directly
    // BELOW the pivot lies along local x.
    const below = canvasPointToElementLocal({ x: 100, y: 300 }, element, natural)
    expect(below.x).toBeCloseTo(400, 6)
    expect(below.y).toBeCloseTo(0, 6)
  })
})

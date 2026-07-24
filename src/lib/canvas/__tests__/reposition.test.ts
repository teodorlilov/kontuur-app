import { describe, expect, it } from 'vitest'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants'
import { coverCrop } from '../cover-crop'
import { DEFAULT_BACKGROUND_TRANSFORM, panBackground, zoomBackgroundTo } from '../reposition'

const CANVAS = { w: CANVAS_WIDTH, h: CANVAS_HEIGHT }
const SQUARE = { width: 1024, height: 1024 }
/** Matches the canvas aspect exactly — zero crop slack at zoom 1. */
const PORTRAIT = { width: 1088, height: 1360 }

describe('panBackground', () => {
  it('dragging right moves the crop window left (the art moves right)', () => {
    const start = { zoom: 2, offsetX: 0.5, offsetY: 0.5 }
    const next = panBackground(start, { dx: 100, dy: 0 }, SQUARE, CANVAS)
    expect(next.zoom).toBe(2)
    expect(next.offsetX).toBeLessThan(0.5)
    expect(next.offsetY).toBe(0.5)
  })

  it('clamps offsets at the source edges', () => {
    const start = { zoom: 2, offsetX: 0.5, offsetY: 0.5 }
    const next = panBackground(start, { dx: 1e6, dy: -1e6 }, SQUARE, CANVAS)
    expect(next.offsetX).toBe(0)
    expect(next.offsetY).toBe(1)
  })

  it('zero-slack axes stay centered', () => {
    const next = panBackground(DEFAULT_BACKGROUND_TRANSFORM, { dx: 500, dy: 500 }, PORTRAIT, CANVAS)
    expect(next).toEqual(DEFAULT_BACKGROUND_TRANSFORM)
  })
})

describe('zoomBackgroundTo', () => {
  it('keeps the source point under the focus fixed while zooming in', () => {
    const focus = { x: 200, y: 300 }
    const start = { zoom: 1.2, offsetX: 0.4, offsetY: 0.6 }
    const before = coverCrop(SQUARE.width, SQUARE.height, CANVAS.w, CANVAS.h, start)
    const next = zoomBackgroundTo(start, 1.8, focus, SQUARE, CANVAS)
    const after = coverCrop(SQUARE.width, SQUARE.height, CANVAS.w, CANVAS.h, next)

    const srcXBefore = before.cropX + (focus.x / CANVAS.w) * before.cropWidth
    const srcXAfter = after.cropX + (focus.x / CANVAS.w) * after.cropWidth
    expect(srcXAfter).toBeCloseTo(srcXBefore, 6)
    const srcYBefore = before.cropY + (focus.y / CANVAS.h) * before.cropHeight
    const srcYAfter = after.cropY + (focus.y / CANVAS.h) * after.cropHeight
    expect(srcYAfter).toBeCloseTo(srcYBefore, 6)
  })

  it('clamps the target zoom to [1, 3] and no-ops at an unchanged zoom', () => {
    const start = { zoom: 2, offsetX: 0.3, offsetY: 0.7 }
    expect(zoomBackgroundTo(start, 99, { x: 0, y: 0 }, SQUARE, CANVAS).zoom).toBe(3)
    expect(zoomBackgroundTo(start, 0.2, { x: 0, y: 0 }, SQUARE, CANVAS).zoom).toBe(1)
    expect(zoomBackgroundTo(start, 2, { x: 0, y: 0 }, SQUARE, CANVAS)).toBe(start)
  })

  it('zooming back out to cover fit recenters zero-slack axes', () => {
    const start = { zoom: 2, offsetX: 0.1, offsetY: 0.9 }
    const next = zoomBackgroundTo(start, 1, { x: 0, y: 0 }, PORTRAIT, CANVAS)
    expect(next).toEqual({ zoom: 1, offsetX: 0.5, offsetY: 0.5 })
  })
})

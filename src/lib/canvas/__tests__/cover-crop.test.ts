import { describe, expect, it } from 'vitest'
import { coverCrop } from '../cover-crop'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants'

describe('coverCrop', () => {
  it('crops equal side slivers from a legacy square on the 4:5 canvas', () => {
    const crop = coverCrop(1024, 1024, CANVAS_WIDTH, CANVAS_HEIGHT)
    expect(crop.cropHeight).toBe(1024)
    expect(crop.cropWidth).toBeCloseTo(1024 * (CANVAS_WIDTH / CANVAS_HEIGHT), 6)
    expect(crop.cropX).toBeCloseTo((1024 - crop.cropWidth) / 2, 6)
    expect(crop.cropY).toBe(0)
  })

  it('crops nothing when the source already matches the canvas aspect (1088×1360)', () => {
    const crop = coverCrop(1088, 1360, CANVAS_WIDTH, CANVAS_HEIGHT)
    expect(crop).toEqual({ cropX: 0, cropY: 0, cropWidth: 1088, cropHeight: 1360 })
  })

  it('crops top and bottom from an ultra-wide source', () => {
    const crop = coverCrop(4000, 1000, CANVAS_WIDTH, CANVAS_HEIGHT)
    expect(crop.cropHeight).toBeCloseTo(1000, 6)
    expect(crop.cropWidth).toBeCloseTo(800, 6)
    expect(crop.cropX).toBeCloseTo(1600, 6)
  })

  it('a default transform is identical to no transform', () => {
    const plain = coverCrop(1024, 1024, CANVAS_WIDTH, CANVAS_HEIGHT)
    const withDefault = coverCrop(1024, 1024, CANVAS_WIDTH, CANVAS_HEIGHT, { zoom: 1, offsetX: 0.5, offsetY: 0.5 })
    expect(withDefault).toEqual(plain)
  })

  it('zoom 2 halves the crop window, still centered by default offsets', () => {
    const crop = coverCrop(1088, 1360, CANVAS_WIDTH, CANVAS_HEIGHT, { zoom: 2, offsetX: 0.5, offsetY: 0.5 })
    expect(crop.cropWidth).toBeCloseTo(544, 6)
    expect(crop.cropHeight).toBeCloseTo(680, 6)
    expect(crop.cropX).toBeCloseTo((1088 - 544) / 2, 6)
    expect(crop.cropY).toBeCloseTo((1360 - 680) / 2, 6)
  })

  it('offsets 0 and 1 pin the window to the source edges', () => {
    const left = coverCrop(1024, 1024, CANVAS_WIDTH, CANVAS_HEIGHT, { zoom: 1, offsetX: 0, offsetY: 0 })
    expect(left.cropX).toBe(0)
    const right = coverCrop(1024, 1024, CANVAS_WIDTH, CANVAS_HEIGHT, { zoom: 1, offsetX: 1, offsetY: 1 })
    expect(right.cropX + right.cropWidth).toBeCloseTo(1024, 6)
    expect(right.cropY + right.cropHeight).toBeCloseTo(1024, 6)
  })

  it('the window never leaves the source for in-range transforms', () => {
    for (const zoom of [1, 1.5, 3]) {
      for (const offset of [0, 0.25, 1]) {
        const crop = coverCrop(1024, 1024, CANVAS_WIDTH, CANVAS_HEIGHT, { zoom, offsetX: offset, offsetY: offset })
        expect(crop.cropX).toBeGreaterThanOrEqual(0)
        expect(crop.cropY).toBeGreaterThanOrEqual(0)
        expect(crop.cropX + crop.cropWidth).toBeLessThanOrEqual(1024 + 1e-9)
        expect(crop.cropY + crop.cropHeight).toBeLessThanOrEqual(1024 + 1e-9)
      }
    }
  })

  it('an offset has no effect on the axis with zero slack', () => {
    // 1088×1360 matches the canvas aspect exactly: at zoom 1 both axes have zero slack.
    const shifted = coverCrop(1088, 1360, CANVAS_WIDTH, CANVAS_HEIGHT, { zoom: 1, offsetX: 1, offsetY: 0 })
    expect(shifted).toEqual({ cropX: 0, cropY: 0, cropWidth: 1088, cropHeight: 1360 })
  })
})

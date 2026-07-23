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
})

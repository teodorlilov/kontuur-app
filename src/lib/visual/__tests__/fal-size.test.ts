import { describe, expect, it } from 'vitest'
import { FAL_IMAGE_SIZE } from '../fal'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/lib/canvas/constants'

describe('FAL_IMAGE_SIZE', () => {
  it('uses multiples of 16 (gpt-image-2 requirement)', () => {
    expect(FAL_IMAGE_SIZE.width % 16).toBe(0)
    expect(FAL_IMAGE_SIZE.height % 16).toBe(0)
  })

  it('is exactly 4:5 — IG Graph API rejects anything taller', () => {
    expect(FAL_IMAGE_SIZE.width / FAL_IMAGE_SIZE.height).toBeCloseTo(0.8, 10)
  })

  it('matches the canvas authoring aspect so the background covers without cropping', () => {
    expect(FAL_IMAGE_SIZE.width / FAL_IMAGE_SIZE.height).toBeCloseTo(CANVAS_WIDTH / CANVAS_HEIGHT, 10)
  })
})

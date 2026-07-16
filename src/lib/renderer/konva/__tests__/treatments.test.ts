import { describe, expect, it } from 'vitest'
import { duotoneFilter, grainFilter, halftoneFilter, tintFilter } from '../treatments'

/** A minimal ImageData stand-in (the filters only touch `.data`). */
function img(pixels: number[]): ImageData {
  return { data: new Uint8ClampedArray(pixels), width: pixels.length / 4, height: 1 } as ImageData
}

const BLACK = { r: 0, g: 0, b: 0 }
const WHITE = { r: 255, g: 255, b: 255 }
const BLUE = { r: 0, g: 0, b: 255 }

describe('duotoneFilter', () => {
  it('maps shadows→shadow colour and highlights→highlight colour (full strength)', () => {
    // black pixel then white pixel, alpha 255
    const d = img([0, 0, 0, 255, 255, 255, 255, 255])
    duotoneFilter({ r: 20, g: 30, b: 60 }, WHITE, 1)(d)
    // black (lum 0) → shadow
    expect([d.data[0], d.data[1], d.data[2]]).toEqual([20, 30, 60])
    // white (lum 1) → highlight
    expect([d.data[4], d.data[5], d.data[6]]).toEqual([255, 255, 255])
  })

  it('is a two-colour ramp — a colourful photo collapses onto the brand family', () => {
    const d = img([200, 40, 40, 255]) // saturated red
    duotoneFilter({ r: 0, g: 0, b: 80 }, WHITE, 1)(d)
    // result sits on the shadow→highlight line: r === g (both interpolate the same way from 0/0)
    expect(d.data[0]).toBe(d.data[1])
  })
})

describe('tintFilter', () => {
  it('washes toward the tint colour and desaturates (grey stays grey-ish, gains a hue)', () => {
    const d = img([120, 120, 120, 255])
    tintFilter(BLUE, 0.5)(d)
    // blue channel pulled up toward 255, red/green pulled down toward 0
    expect(d.data[2]).toBeGreaterThan(d.data[0]!)
  })

  it('leaves alpha untouched', () => {
    const d = img([120, 120, 120, 200])
    tintFilter(BLUE, 0.5)(d)
    expect(d.data[3]).toBe(200)
  })
})

describe('grainFilter', () => {
  it('perturbs colour channels within ±amount but not alpha', () => {
    const d = img([128, 128, 128, 255])
    grainFilter(20)(d)
    expect(d.data[3]).toBe(255)
    expect(Math.abs(d.data[0]! - 128)).toBeLessThanOrEqual(10)
  })
})

describe('halftoneFilter', () => {
  const SHADOW = { r: 10, g: 20, b: 30 }

  it('snaps every pixel to one of the two brand tones (dithered two-tone)', () => {
    const d = img([0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255, 60, 60, 60, 255])
    halftoneFilter(SHADOW, WHITE)(d)
    for (let i = 0; i < d.data.length; i += 4) {
      const isShadow = d.data[i] === SHADOW.r && d.data[i + 1] === SHADOW.g && d.data[i + 2] === SHADOW.b
      const isHigh = d.data[i] === 255 && d.data[i + 1] === 255 && d.data[i + 2] === 255
      expect(isShadow || isHigh).toBe(true)
    }
  })

  it('black → shadow, white → highlight, alpha untouched', () => {
    const d = img([0, 0, 0, 255, 255, 255, 255, 200])
    halftoneFilter(SHADOW, WHITE)(d)
    expect([d.data[0], d.data[1], d.data[2]]).toEqual([10, 20, 30])
    expect([d.data[4], d.data[5], d.data[6]]).toEqual([255, 255, 255])
    expect(d.data[7]).toBe(200)
  })
})

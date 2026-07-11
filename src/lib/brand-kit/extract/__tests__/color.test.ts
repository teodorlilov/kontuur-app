import { describe, expect, it } from 'vitest'
import { contrastRatio, parseHex, relativeLuminance, saturation, toHex } from '../color'

describe('color math', () => {
  it('parses 3- and 6-digit hex, with or without #', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseHex('2563EB')).toEqual({ r: 37, g: 99, b: 235 })
    expect(parseHex('not-a-color')).toBeNull()
  })

  it('round-trips to uppercase hex', () => {
    expect(toHex({ r: 37, g: 99, b: 235 })).toBe('#2563EB')
  })

  it('ranks luminance white > grey > black', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeGreaterThan(relativeLuminance({ r: 128, g: 128, b: 128 }))
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0)
  })

  it('treats greys as unsaturated and pure hues as saturated', () => {
    expect(saturation({ r: 128, g: 128, b: 128 })).toBe(0)
    expect(saturation({ r: 37, g: 99, b: 235 })).toBeGreaterThan(0.5)
  })

  it('gives black-on-white the maximum contrast', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 0)
  })
})

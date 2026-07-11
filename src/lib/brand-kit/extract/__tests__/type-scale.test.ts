import { describe, expect, it } from 'vitest'
import { fitTypeScale } from '../type-scale'

describe('fitTypeScale', () => {
  it('recovers a clean 1.5 ladder', () => {
    // 16 · 1.5^k → 16, 24, 36, 54
    expect(fitTypeScale([16, 24, 36, 54])).toEqual({ scale: 1.5, baseSize: 16 })
  })

  it('recovers a 1.25 ladder', () => {
    // 16 · 1.25^k → 16, 20, 25, 31.25, 39
    const fit = fitTypeScale([16, 20, 25, 39])
    expect(fit.baseSize).toBe(16)
    expect(fit.scale).toBe(1.25)
  })

  it('defaults sensibly with too little to fit', () => {
    expect(fitTypeScale([])).toEqual({ scale: 1.25, baseSize: 16 })
    expect(fitTypeScale([18])).toEqual({ scale: 1.25, baseSize: 18 })
  })

  it('ignores non-positive and non-finite sizes', () => {
    expect(fitTypeScale([0, -4, Number.NaN, 16, 24, 36, 54]).scale).toBe(1.5)
  })
})

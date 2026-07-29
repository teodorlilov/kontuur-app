import { describe, it, expect } from 'vitest'
import { checkCarouselStructure } from '../check-structure'

function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `w${i}`).join(' ')
}

function slides(bodies: string[]): Array<{ headline: string; body: string }> {
  return bodies.map((body, i) => ({ headline: `Headline ${i + 1}`, body }))
}

describe('checkCarouselStructure', () => {
  it('passes a well-formed carousel', () => {
    const result = checkCarouselStructure(words(50), slides(['', words(20), words(25), words(10)]))
    expect(result).toEqual({ passes: true, notes: [] })
  })

  it('tolerates captions slightly outside 40-60 (no boundary nagging)', () => {
    expect(checkCarouselStructure(words(37), slides([''])).passes).toBe(true)
    expect(checkCarouselStructure(words(68), slides([''])).passes).toBe(true)
  })

  it('flags a caption far outside the target with the real count', () => {
    const result = checkCarouselStructure(words(80), slides(['']))
    expect(result.passes).toBe(false)
    expect(result.notes[0]).toContain('80 words')
  })

  it('flags cover body text', () => {
    const result = checkCarouselStructure(words(50), slides(['Swipe to see more →', words(20)]))
    expect(result.passes).toBe(false)
    expect(result.notes[0]).toContain('Cover slide has body text')
  })

  it('flags oversized slide bodies with the slide number', () => {
    const result = checkCarouselStructure(words(50), slides(['', words(20), words(45)]))
    expect(result.passes).toBe(false)
    expect(result.notes[0]).toContain('Slide 3')
    expect(result.notes[0]).toContain('45 words')
  })

  it('never flags the cover for body length (only for having a body at all)', () => {
    const result = checkCarouselStructure(words(50), slides([words(45)]))
    expect(result.notes).toHaveLength(1)
    expect(result.notes[0]).toContain('Cover slide')
  })
})

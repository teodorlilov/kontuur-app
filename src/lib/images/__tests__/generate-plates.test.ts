import { describe, expect, it } from 'vitest'
import { composeSlides } from '@/lib/renderer/compose'
import type { CarouselSlide } from '@/types/api'
import { promptHash, seedFromClient } from '../hash'
import { hasPlateLayer, plateLayer, plateRole } from '../generate-plates'

const slide = (o: Partial<CarouselSlide> = {}): CarouselSlide => ({ headline: 'H', body: 'B', ...o })
const compOf = (slug: string) => composeSlides([slide()], { feedSystemSlug: slug, ratio: '4:5', postId: 'p' })[0]!

describe('hash', () => {
  it('promptHash is stable for equal inputs regardless of key order', () => {
    expect(promptHash({ a: 1, b: 2 })).toBe(promptHash({ b: 2, a: 1 }))
  })

  it('promptHash differs when the copy differs', () => {
    expect(promptHash({ headline: 'A' })).not.toBe(promptHash({ headline: 'B' }))
  })

  it('seedFromClient is deterministic and non-negative', () => {
    const s = seedFromClient('client-123')
    expect(s).toBe(seedFromClient('client-123'))
    expect(s).not.toBe(seedFromClient('client-456'))
    expect(s).toBeGreaterThanOrEqual(0)
  })
})

describe('plateRole', () => {
  it('the cover is the hero; content + CTA are interior/supporting', () => {
    expect(plateRole('cover')).toBe('cover')
    expect(plateRole('content')).toBe('interior')
    expect(plateRole('cta')).toBe('interior')
  })
})

describe('plate detection', () => {
  it('a generative style carries a full-bleed design plate', () => {
    expect(hasPlateLayer(compOf('editorial'))).toBe(true)
    expect(plateLayer(compOf('editorial'))?.type).toBe('plate')
    expect(plateLayer(compOf('editorial'))?.cutout).toBeFalsy()
  })

  it('quiet-grid is a solid colour ground, not a plate (no imagery, no spend)', () => {
    expect(hasPlateLayer(compOf('quiet-grid'))).toBe(false)
    expect(plateLayer(compOf('quiet-grid'))).toBeUndefined()
  })
})

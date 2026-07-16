import { describe, expect, it } from 'vitest'
import { DEFAULT_ART_DIRECTION, type ArtDirection } from '@/lib/brand-kit/art-direction'
import { directionToStyleSlug, resolveArtDirection } from '../art-direction'

const ad = (over: Partial<ArtDirection> = {}): ArtDirection => ({ ...DEFAULT_ART_DIRECTION, ...over })

describe('directionToStyleSlug', () => {
  it('minimal imagery → quiet-grid (no photos)', () => {
    expect(directionToStyleSlug(ad({ imagery: 'minimal' }))).toBe('quiet-grid')
  })

  it('vector / illustrative → illustrative', () => {
    expect(directionToStyleSlug(ad({ imagery: 'vector' }))).toBe('illustrative')
    expect(directionToStyleSlug(ad({ imagery: 'illustrative' }))).toBe('illustrative')
  })

  it('clinical → editorial when photographic, quiet-grid otherwise (never a loud gimmicky pool)', () => {
    expect(directionToStyleSlug(ad({ formality: 'clinical', imagery: 'photographic' }))).toBe('editorial')
    expect(directionToStyleSlug(ad({ formality: 'clinical', imagery: 'mixed' }))).toBe('quiet-grid')
  })

  it('expressive → bold-blocks; corporate/editorial → editorial', () => {
    expect(directionToStyleSlug(ad({ formality: 'expressive' }))).toBe('bold-blocks')
    expect(directionToStyleSlug(ad({ formality: 'corporate' }))).toBe('editorial')
    expect(directionToStyleSlug(ad({ formality: 'editorial' }))).toBe('editorial')
  })
})

describe('resolveArtDirection', () => {
  it('derives the pool slug and carries the photo treatment', () => {
    const r = resolveArtDirection(ad({ formality: 'expressive', treatment: 'halftone' }))
    expect(r.styleSlug).toBe('bold-blocks')
    expect(r.treatment).toBe('halftone')
  })

  it('a clinical brand resolves to a restrained pool + grade', () => {
    const r = resolveArtDirection(ad({ formality: 'clinical', imagery: 'photographic', treatment: 'tint' }))
    expect(r.styleSlug).toBe('editorial')
    expect(r.treatment).toBe('tint')
  })
})

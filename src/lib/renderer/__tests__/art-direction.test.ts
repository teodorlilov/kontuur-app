import { describe, expect, it } from 'vitest'
import { DEFAULT_ART_DIRECTION, type ArtDirection } from '@/lib/brand-kit/art-direction'
import { artDirectionConditioning, resolveArtDirection } from '../art-direction'

const ad = (over: Partial<ArtDirection> = {}): ArtDirection => ({ ...DEFAULT_ART_DIRECTION, ...over })

describe('artDirectionConditioning', () => {
  it('phrases the formality, density, and palette discipline, and folds in the personality', () => {
    const phrase = artDirectionConditioning(ad({ formality: 'clinical', density: 'airy', paletteDiscipline: 'mono-accent', personality: 'trusted local firm' }))
    expect(phrase).toContain('clinical')
    expect(phrase).toContain('generous spacing')
    expect(phrase).toContain('single-accent')
    expect(phrase).toContain('trusted local firm')
  })

  it('reads bold for an expressive, dense, multi-colour brand', () => {
    const phrase = artDirectionConditioning(ad({ formality: 'expressive', density: 'dense', paletteDiscipline: 'multi' }))
    expect(phrase).toContain('expressive')
    expect(phrase).toContain('rich and layered')
    expect(phrase).toContain('full')
  })

  it('omits the personality clause when it is empty', () => {
    expect(artDirectionConditioning(ad({ personality: '' }))).not.toContain('overall feel')
  })
})

describe('resolveArtDirection', () => {
  it('carries the photo treatment, ornament brief, and conditioning phrase — no layout pool', () => {
    const r = resolveArtDirection(ad({ formality: 'expressive', treatment: 'halftone', ornamentBrief: 'angular shards' }))
    expect(r.treatment).toBe('halftone')
    expect(r.ornamentBrief).toBe('angular shards')
    expect(r.conditioning).toContain('expressive')
    expect(r).not.toHaveProperty('styleSlug')
  })
})

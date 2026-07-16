import { describe, expect, it } from 'vitest'
import { clampArtDirection, DEFAULT_ART_DIRECTION, type ArtDirection } from '../art-direction'

describe('clampArtDirection', () => {
  it('passes a fully valid spec through unchanged', () => {
    const valid: ArtDirection = {
      personality: 'bold and playful',
      formality: 'expressive',
      imagery: 'mixed',
      density: 'dense',
      typeCase: 'upper',
      paletteDiscipline: 'multi',
      treatment: 'halftone',
      ornamentBrief: 'chunky geometric marks',
    }
    expect(clampArtDirection(valid)).toEqual(valid)
  })

  it('falls back per-field on bad or missing values (never a broken spec)', () => {
    const out = clampArtDirection({ formality: 'nope', imagery: 42, treatment: 'sepia', density: null })
    expect(out.formality).toBe(DEFAULT_ART_DIRECTION.formality)
    expect(out.imagery).toBe(DEFAULT_ART_DIRECTION.imagery)
    expect(out.treatment).toBe(DEFAULT_ART_DIRECTION.treatment)
    expect(out.density).toBe(DEFAULT_ART_DIRECTION.density)
    expect(out.personality).toBe(DEFAULT_ART_DIRECTION.personality)
  })

  it('never throws on junk input', () => {
    expect(clampArtDirection(null)).toEqual(DEFAULT_ART_DIRECTION)
    expect(clampArtDirection(undefined)).toEqual(DEFAULT_ART_DIRECTION)
    expect(clampArtDirection('not an object')).toEqual(DEFAULT_ART_DIRECTION)
  })
})

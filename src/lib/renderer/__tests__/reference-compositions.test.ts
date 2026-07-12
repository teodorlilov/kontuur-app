import { describe, expect, it } from 'vitest'
import { validateShareableComposition } from '@/lib/scene-graph'
import { REFERENCE_COMPOSITIONS } from '../reference-compositions'

const entries = Object.entries(REFERENCE_COMPOSITIONS)

describe('reference compositions', () => {
  it('covers the five roles', () => {
    expect(Object.keys(REFERENCE_COMPOSITIONS).sort()).toEqual(['cover', 'cta', 'list', 'quote', 'statement'])
  })

  // Token-binding resolution + rendering is exercised against the Konva renderer at runtime (canvas is
  // unavailable in jsdom); here we assert the compositions are valid, shareable, token-only scene graphs.
  it.each(entries)('%s is a valid shareable composition (no hex, no literal family)', (_role, composition) => {
    expect(validateShareableComposition(composition)).toEqual([])
  })
})

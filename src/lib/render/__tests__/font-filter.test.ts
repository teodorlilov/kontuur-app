import { describe, expect, it } from 'vitest'
import { FONT_LIBRARY, type FontEntry } from '../font-library'
import {
  familyCoversSubsets,
  filterFamiliesForLanguages,
  proposeFamilies,
  requiredSubsets,
  scriptsForLanguage,
} from '../font-filter'

describe('scriptsForLanguage', () => {
  it('maps Bulgarian to Cyrillic and English (and unknowns) to Latin', () => {
    expect(scriptsForLanguage('Bulgarian')).toEqual(['cyrillic'])
    expect(scriptsForLanguage('bg')).toEqual(['cyrillic'])
    expect(scriptsForLanguage('English')).toEqual(['latin'])
    expect(scriptsForLanguage('')).toEqual(['latin'])
  })
})

describe('requiredSubsets', () => {
  it('unions the scripts of primary and secondary languages', () => {
    expect(requiredSubsets('Bulgarian', 'English').sort()).toEqual(['cyrillic', 'latin'])
    expect(requiredSubsets('English', null)).toEqual(['latin'])
  })
})

describe('filterFamiliesForLanguages', () => {
  it('keeps the whole library for a Bulgarian client (every family covers Cyrillic)', () => {
    expect(filterFamiliesForLanguages('Bulgarian')).toHaveLength(FONT_LIBRARY.length)
  })

  it('excludes a hypothetical Latin-only face for a Bulgarian client', () => {
    const latinOnly: FontEntry = { family: 'Latin Only', category: 'sans', bulgarian: 'verify', baked: false, subsets: ['latin'] }
    expect(familyCoversSubsets(latinOnly, requiredSubsets('Bulgarian'))).toBe(false)
    expect(familyCoversSubsets(latinOnly, requiredSubsets('English'))).toBe(true)
  })
})

describe('proposeFamilies', () => {
  it('returns families in the requested category, baked defaults first', () => {
    const serifs = proposeFamilies('serif', 3)
    expect(serifs.length).toBeGreaterThan(0)
    expect(serifs.every((f) => f.category === 'serif')).toBe(true)
    expect(serifs[0]!.baked).toBe(true) // Source Serif 4 leads
  })
})

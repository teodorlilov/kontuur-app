import { describe, expect, it } from 'vitest'
import { exactLibraryFamily, matchDisplayAndBody, primaryFamily } from '../font-match'

describe('primaryFamily', () => {
  it('returns the first named face, stripping quotes', () => {
    expect(primaryFamily('"Montserrat", sans-serif')).toBe('Montserrat')
    expect(primaryFamily("'Source Sans 3', Arial, sans-serif")).toBe('Source Sans 3')
  })

  it('skips leading generics and system aliases', () => {
    expect(primaryFamily('-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto')).toBe('Segoe UI')
    expect(primaryFamily('sans-serif')).toBeNull()
  })
})

describe('exactLibraryFamily', () => {
  it('matches a library face case/space-insensitively', () => {
    expect(exactLibraryFamily('montserrat, sans-serif')).toBe('Montserrat')
    expect(exactLibraryFamily('"Playfair Display", serif')).toBe('Playfair Display')
  })

  it('returns null for a face not in the library', () => {
    expect(exactLibraryFamily('"Helvetica Neue", Arial')).toBeNull()
  })
})

const FALLBACK = { display: 'Source Serif 4', body: 'Source Sans 3' }

describe('matchDisplayAndBody', () => {
  it('keeps the site fonts when both are in the library (exact, badged measured)', () => {
    const { display, body } = matchDisplayAndBody('"Playfair Display", serif', 'Roboto, sans-serif', FALLBACK)
    expect(display).toEqual({ family: 'Playfair Display', exact: true })
    expect(body).toEqual({ family: 'Roboto', exact: true })
  })

  it('does not collapse display and body to the same family when the site names two different faces', () => {
    // Two different non-library sans faces both classify as `sans` — the old code returned the one top
    // family for both. They must differ.
    const { display, body } = matchDisplayAndBody('"Helvetica Neue", sans-serif', 'Arial, sans-serif', FALLBACK)
    expect(display.exact).toBe(false)
    expect(body.exact).toBe(false)
    expect(body.family).not.toBe(display.family)
  })

  it('maps an unknown serif heading to a serif library family (not a sans)', () => {
    const { display } = matchDisplayAndBody('"Times New Roman", Georgia, serif', 'Arial', FALLBACK)
    expect(display.exact).toBe(false)
    // familyCategory sees a serif stack → a serif proposal
    expect(['Playfair Display', 'Cormorant Garamond', 'Source Serif 4', 'Lora', 'Alegreya']).toContain(display.family)
  })
})

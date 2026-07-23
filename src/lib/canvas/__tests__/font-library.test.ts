import { describe, expect, it } from 'vitest'
import { BRAND_STYLES } from '@/lib/visual/brand-styles'
import { availableFonts, FONT_LIBRARY, getFontEntry, hasCyrillic } from '../font-library'
import { editorFontsHref } from '../google-fonts'

describe('FONT_LIBRARY', () => {
  it('every entry offers weight 400', () => {
    for (const entry of FONT_LIBRARY) expect(entry.weights).toContain(400)
  })

  it('covers all four picker categories', () => {
    const categories = new Set(FONT_LIBRARY.map((entry) => entry.category))
    expect(categories).toEqual(new Set(['display', 'serif', 'sans', 'script']))
  })

  it('both brand-style pairings resolve to Cyrillic-safe entries', () => {
    for (const style of Object.values(BRAND_STYLES)) {
      for (const family of [style.fonts.display, style.fonts.body]) {
        const entry = getFontEntry(family)
        expect(entry, `${style.id} → ${family}`).not.toBeNull()
        expect(entry!.cyrillic, `${family} must support Cyrillic`).toBe(true)
      }
    }
  })
})

describe('hasCyrillic', () => {
  it('detects Bulgarian text', () => {
    expect(hasCyrillic('Ново предложение')).toBe(true)
    expect(hasCyrillic('Summer offer!')).toBe(false)
    expect(hasCyrillic('')).toBe(false)
  })
})

describe('availableFonts', () => {
  it('hides Latin-only families when Cyrillic is required', () => {
    const families = availableFonts(true).map((entry) => entry.family)
    expect(families).not.toContain('Bebas Neue')
    expect(families).not.toContain('Poppins')
    expect(families).toContain('Oswald')
  })

  it('offers the full library for Latin-only text', () => {
    expect(availableFonts(false)).toHaveLength(FONT_LIBRARY.length)
  })
})

describe('editorFontsHref', () => {
  it('builds a css2 href with per-family weights', () => {
    const href = editorFontsHref(FONT_LIBRARY.filter((entry) => entry.family === 'Oswald'))
    expect(href).toBe('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;700&display=swap')
  })

  it('returns null for an empty set', () => {
    expect(editorFontsHref([])).toBeNull()
  })
})

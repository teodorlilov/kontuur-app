import { describe, expect, it } from 'vitest'
import { BRAND_STYLES } from '@/lib/visual/brand-styles'
import { fontOptions, FONT_LIBRARY, getFontEntry, hasCyrillic } from '../font-library'
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

describe('fontOptions', () => {
  const families = (input: Parameters<typeof fontOptions>[0]) =>
    fontOptions(input).map((entry) => entry.family)

  it('hides Latin-only families when Cyrillic is required', () => {
    const offered = families({ requiresCyrillic: true })
    expect(offered).not.toContain('Bebas Neue')
    expect(offered).not.toContain('Poppins')
    expect(offered).toContain('Oswald')
  })

  it('offers the full library for Latin-only text', () => {
    expect(fontOptions({ requiresCyrillic: false })).toHaveLength(FONT_LIBRARY.length)
  })

  it('narrows to the tiers a slot accepts', () => {
    const offered = families({ requiresCyrillic: false, categories: ['sans', 'serif'] })
    // Body copy is read at 26–44px, where a display face is the difference between a caption and a
    // decoration — and a script is an accent, which no lockup role lands one in.
    expect(offered).not.toContain('Bebas Neue')
    expect(offered).not.toContain('Caveat')
    expect(offered).toContain('Inter')
  })

  it('keeps a stored choice offered even when the filters exclude it', () => {
    // A `<select>` whose value matches no option shows the first one instead — so dropping the
    // stored family makes the control claim a face the posts are not set in, silently.
    const offered = families({ requiresCyrillic: true, keep: 'Poppins' })
    expect(offered).toContain('Poppins')
    expect(offered).not.toContain('Bebas Neue')
  })

  it('does not let keep smuggle a family past the category filter', () => {
    // `keep` answers the script question only. A body slot must not be handed a display face
    // because it happens to be what is stored — that is a different repair.
    const offered = families({
      requiresCyrillic: true,
      categories: ['sans'],
      keep: 'Abril Fatface',
    })
    expect(offered).not.toContain('Abril Fatface')
  })
})

describe('editorFontsHref', () => {
  it('builds a css2 href with per-family weights', () => {
    const href = editorFontsHref(FONT_LIBRARY.filter((entry) => entry.family === 'Oswald'))
    expect(href).toBe(
      'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap'
    )
  })

  it('returns null for an empty set', () => {
    expect(editorFontsHref([])).toBeNull()
  })
})

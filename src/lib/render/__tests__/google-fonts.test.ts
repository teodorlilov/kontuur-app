import { describe, expect, it } from 'vitest'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'
import { googleFontsHref } from '../google-fonts'

describe('googleFontsHref', () => {
  it('returns null when both kit families are baked (the Phase-0 default kit)', () => {
    expect(googleFontsHref(DEFAULT_TOKENS)).toBeNull()
  })

  it('builds a CSS2 url for a non-baked family and excludes the baked one', () => {
    const tokens = {
      ...DEFAULT_TOKENS,
      type: {
        ...DEFAULT_TOKENS.type,
        display: { ...DEFAULT_TOKENS.type.display, family: 'Montserrat', weights: [700, 600] },
      },
    }
    // body stays Source Sans 3 (baked) → excluded; only Montserrat is fetched, weights sorted.
    expect(googleFontsHref(tokens)).toBe(
      'https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&display=block'
    )
  })
})

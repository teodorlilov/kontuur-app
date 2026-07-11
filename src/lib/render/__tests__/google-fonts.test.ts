import { describe, expect, it } from 'vitest'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'
import { googleFontsHref } from '../google-fonts'

describe('googleFontsHref', () => {
  it('builds a CSS2 url for the kit families with merged, sorted weights and display=block', () => {
    expect(googleFontsHref(DEFAULT_TOKENS)).toBe(
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=block'
    )
  })
})

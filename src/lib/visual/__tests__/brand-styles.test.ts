import { describe, it, expect } from 'vitest'
import {
  BRAND_STYLES,
  BRAND_STYLE_IDS,
  DEFAULT_BRAND_STYLE_ID,
  getBrandStyle,
} from '../brand-styles'
import { expectColorFree } from './color-words'

describe('brand style registry', () => {
  it('resolves unknown or missing ids to the default style', () => {
    expect(getBrandStyle(undefined).id).toBe(DEFAULT_BRAND_STYLE_ID)
    expect(getBrandStyle('not-a-style').id).toBe(DEFAULT_BRAND_STYLE_ID)
    expect(getBrandStyle('clinical-luxury').id).toBe('clinical-luxury')
  })

  it('every entry ships a usable prompt, description, and preview image path', () => {
    for (const id of BRAND_STYLE_IDS) {
      const style = BRAND_STYLES[id]
      expect(style.id).toBe(id)
      expect(style.name.length).toBeGreaterThan(0)
      expect(style.description.length).toBeGreaterThan(0)
      expect(style.prompt.length).toBeGreaterThan(100)
      // The filename still derives from the id; the optional -vN is a cache-buster, needed because
      // a preview regenerated in place keeps being served from browser and CDN caches.
      expect(style.previewSrc).toMatch(new RegExp(`^/brand-styles/${id}(-v\\d+)?\\.jpg$`))
    }
  })

  it('style prompts never name colours — the palette is the only colour source', () => {
    for (const id of BRAND_STYLE_IDS) {
      expect(() => expectColorFree(BRAND_STYLES[id].prompt, `${id} prompt`)).not.toThrow()
    }
  })
})

import { describe, it, expect } from 'vitest'
import { BRAND_STYLES, BRAND_STYLE_IDS, DEFAULT_BRAND_STYLE_ID, getBrandStyle } from '../brand-styles'

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
      expect(style.previewSrc).toBe(`/brand-styles/${id}.jpg`)
    }
  })

  it('style prompts never name colours — the palette is the only colour source', () => {
    const colorWords = /yellow|black|white|blue|brown|cream|taupe|beige|neutral tones/i
    for (const id of BRAND_STYLE_IDS) {
      expect(BRAND_STYLES[id].prompt).not.toMatch(colorWords)
    }
  })
})

import { describe, it, expect } from 'vitest'
import { buildVisualPrompt, carouselSlideText, sanitizePromptText, singlePostText, slideTextBlock } from '../prompt'

describe('sanitizePromptText', () => {
  it('strips URLs, hashtags, and mentions and collapses whitespace', () => {
    const dirty = 'Track  everything https://ga.example.com  #analytics #GA4 with @acme_team today'
    expect(sanitizePromptText(dirty)).toBe('Track everything with today')
  })
})

describe('carouselSlideText', () => {
  it('formats the slide position, headline, and body', () => {
    const text = carouselSlideText({ headline: 'Layer 2: Connect GA4', body: 'GA4 shows where users go.' }, 2, 8)
    expect(text).toBe('Slide 3 of 8\n\nHeadline: Layer 2: Connect GA4\nBody: GA4 shows where users go.')
  })

  it('omits an empty body line instead of leaving a dangling label', () => {
    const text = carouselSlideText({ headline: 'Save this', body: '' }, 7, 8)
    expect(text).toBe('Slide 8 of 8\n\nHeadline: Save this')
  })

  it('returns null when the slide has no usable copy', () => {
    expect(carouselSlideText({ headline: '', body: '  ' }, 0, 4)).toBeNull()
  })
})

describe('singlePostText', () => {
  it('labels the block and clamps long captions at a word boundary', () => {
    const caption = `${'word '.repeat(120)}ending`
    const text = singlePostText(caption)
    expect(text).not.toBeNull()
    expect(text!.startsWith('Single image post\n\n')).toBe(true)
    const body = text!.slice('Single image post\n\n'.length)
    expect(body.length).toBeLessThanOrEqual(501)
    expect(body.endsWith('…')).toBe(true)
    expect(body).not.toContain('wor…')
  })

  it('returns null for an empty caption', () => {
    expect(singlePostText(null)).toBeNull()
    expect(singlePostText('#only #tags')).toBeNull()
  })
})

describe('slideTextBlock', () => {
  const slides = [
    { headline: 'Hook', body: 'Why this matters.' },
    { headline: 'Step 1', body: 'Do the thing.' },
  ]

  it('uses the actual slides array length, not any requested count', () => {
    const text = slideTextBlock({ postType: 'carousel', slides, caption: null, position: 1 })
    expect(text).toContain('Slide 2 of 2')
  })

  it('returns null for an out-of-range position', () => {
    expect(slideTextBlock({ postType: 'carousel', slides, caption: null, position: 5 })).toBeNull()
    expect(slideTextBlock({ postType: 'single', slides: [], caption: 'Hi', position: 1 })).toBeNull()
  })

  it('derives single posts from the caption at position 0', () => {
    const text = slideTextBlock({ postType: 'single', slides: [], caption: 'A tip about GA4', position: 0 })
    expect(text).toBe('Single image post\n\nA tip about GA4')
  })
})

describe('buildVisualPrompt', () => {
  it('produces the exact 3-variable template', () => {
    const prompt = buildVisualPrompt({
      textBlock: 'Slide 1 of 2\n\nHeadline: Hook\nBody: Why.',
      paletteDescription: 'Dominant background: white\nPalette character: Cool and clean.',
      stylePrompt: 'Editorial style paragraph.',
    })
    expect(prompt).toBe(
      'create a visual for social media for this slide\n' +
        'TEXT - Slide 1 of 2\n\nHeadline: Hook\nBody: Why.\n' +
        '\nCOLOR PALETTE\n\n' +
        'Dominant background: white\nPalette character: Cool and clean.\n' +
        '\nSTYLE\n\n' +
        'Editorial style paragraph.\n' +
        "\nUse the palette as the visual color foundation. Don't add text, just illustration relevant to the data the visual is for"
    )
  })
})

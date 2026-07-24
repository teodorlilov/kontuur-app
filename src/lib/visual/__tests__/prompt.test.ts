import { describe, it, expect } from 'vitest'
import { buildVisualPrompt, carouselSlideText, sanitizePromptText, singlePostText, slideTextBlock } from '../prompt'

describe('sanitizePromptText', () => {
  it('strips URLs, hashtags, and mentions and collapses whitespace', () => {
    const dirty = 'Track  everything https://ga.example.com  #analytics #GA4 with @acme_team today'
    expect(sanitizePromptText(dirty)).toBe('Track everything with today')
  })
})

describe('carouselSlideText', () => {
  it('formats the slide position, role hint, headline, and body', () => {
    const text = carouselSlideText({ headline: 'Layer 2: Connect GA4', body: 'GA4 shows where users go.' }, 3, 8)
    expect(text).toBe(
      'Slide 4 of 8\n' +
        'This is a quiet middle slide: a restrained, minimal take on the style — ONE small supporting subject only, sparse elements, most of the canvas plain calm background; keep the top quarter and the lower half of the canvas calm and uncluttered, text will be overlaid there.\n' +
        '\nHeadline: Layer 2: Connect GA4\nBody: GA4 shows where users go.'
    )
  })

  it('alternates quiet and rich middle slides by position', () => {
    const slide = { headline: 'H', body: 'B' }
    expect(carouselSlideText(slide, 1, 6)).toContain('quiet middle slide')
    expect(carouselSlideText(slide, 2, 6)).toContain('richly detailed middle slide')
    expect(carouselSlideText(slide, 3, 6)).toContain('quiet middle slide')
    expect(carouselSlideText(slide, 4, 6)).toContain('richly detailed middle slide')
  })

  it('omits an empty body line instead of leaving a dangling label', () => {
    const text = carouselSlideText({ headline: 'Save this', body: '' }, 7, 8)
    expect(text).toContain('Slide 8 of 8\n')
    expect(text).toContain('\n\nHeadline: Save this')
    expect(text).not.toContain('Body:')
  })

  it('marks the first slide as the cover anchor', () => {
    const text = carouselSlideText({ headline: 'Hook', body: 'Why.' }, 0, 6)
    expect(text).toContain('cover slide')
    expect(text).toContain('dominant focal subject')
  })

  it('marks the last slide as the call-to-action', () => {
    const text = carouselSlideText({ headline: 'Do it', body: 'Now.' }, 5, 6)
    expect(text).toContain('call-to-action slide')
  })

  it('a two-slide carousel gets cover then CTA, never a middle hint', () => {
    expect(carouselSlideText({ headline: 'A', body: 'a' }, 0, 2)).toContain('cover slide')
    expect(carouselSlideText({ headline: 'B', body: 'b' }, 1, 2)).toContain('call-to-action slide')
  })

  it('a one-slide carousel is a cover, not a CTA', () => {
    expect(carouselSlideText({ headline: 'Solo', body: '' }, 0, 1)).toContain('cover slide')
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

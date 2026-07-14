import { describe, expect, it } from 'vitest'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'
import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import {
  buildImagePrompt,
  formatForModel,
  hexToColorName,
  NEGATIVE_PROMPT,
  paletteWords,
} from '../prompt'

const brief: BrandBrief = {
  photographicSubjects: ['a sunlit modern apartment interior'],
  motifs: ['clean geometric lines'],
  mood: 'calm and aspirational',
}

describe('hexToColorName', () => {
  it('names neutrals by lightness', () => {
    expect(hexToColorName('#FFFFFF')).toBe('white')
    expect(hexToColorName('#000000')).toBe('black')
    expect(hexToColorName('#808080')).toBe('grey')
  })

  it('names hues, qualified by lightness/saturation', () => {
    expect(hexToColorName('#2563EB')).toContain('blue')
    expect(hexToColorName('#1E3A8A')).toBe('deep blue')
    expect(hexToColorName('#0BDA51')).toContain('green')
  })

  it('falls back to "neutral" for an unparseable value', () => {
    expect(hexToColorName('not-a-hex')).toBe('neutral')
  })
})

describe('paletteWords', () => {
  it('lists accent/accent-deep/surface as words, deduped', () => {
    const words = paletteWords(DEFAULT_TOKENS.color)
    expect(words).toContain('blue')
    expect(words).toContain('white')
    // No duplicate colour words.
    const parts = words.split(', ')
    expect(new Set(parts).size).toBe(parts.length)
  })
})

describe('buildImagePrompt', () => {
  it('uses the provided scene and marks a cover as the hero', () => {
    const p = buildImagePrompt({
      role: 'cover', brief, colors: DEFAULT_TOKENS.color, feedSystemSlug: 'editorial', ratio: '4:5',
      scene: 'a barista pouring latte art',
    })
    expect(p.subject).toContain('hero image')
    expect(p.subject).toContain('a barista pouring latte art')
    expect(p.style).toContain('editorial')
    expect(p.style).toContain('calm and aspirational') // mood folded in
    expect(p.framing).toContain('4:5')
  })

  it('falls back to a brief subject + motif when no scene is given', () => {
    const p = buildImagePrompt({
      role: 'interior', brief, colors: DEFAULT_TOKENS.color, feedSystemSlug: 'quiet-grid', ratio: '1:1',
    })
    expect(p.subject).toContain('a sunlit modern apartment interior')
    expect(p.subject).toContain('clean geometric lines')
    expect(p.subject).toContain('textural') // interior directive
    expect(p.style).toContain('minimal and airy') // quiet-grid art direction
  })

  it('degrades gracefully with a null brief (unknown feed system → editorial)', () => {
    const p = buildImagePrompt({
      role: 'cover', brief: null, colors: DEFAULT_TOKENS.color, feedSystemSlug: null, ratio: '4:5',
    })
    expect(p.subject).toContain('abstract')
    expect(p.style).toContain('editorial')
    expect(p.negative).toBe(NEGATIVE_PROMPT)
  })

  it('cutout mode → isolated subject on a plain ground, framed for clean removal', () => {
    const p = buildImagePrompt({
      role: 'interior', brief, colors: DEFAULT_TOKENS.color, feedSystemSlug: 'bold-blocks', ratio: '4:5',
      scene: 'a ceramic pour-over coffee dripper', cutout: true,
    })
    expect(p.subject).toContain('isolated subject')
    expect(p.subject).toContain('a ceramic pour-over coffee dripper')
    // Framing is the removal-friendly directive, not the ratio negative-space one.
    expect(p.framing).toContain('background removal')
    expect(p.framing).not.toContain('4:5')
  })
})

describe('formatForModel', () => {
  const structured = buildImagePrompt({
    role: 'cover', brief, colors: DEFAULT_TOKENS.color, feedSystemSlug: 'editorial', ratio: '4:5',
    scene: 'a barista pouring latte art',
  })

  it('flux → prose that forbids text; negative prompt carried', () => {
    const { prompt, negativePrompt } = formatForModel(structured, 'flux')
    expect(prompt).toMatch(/no text/i)
    expect(prompt).toContain('.')
    expect(negativePrompt).toBe(NEGATIVE_PROMPT)
  })

  it('sdxl → comma-separated tags', () => {
    const { prompt } = formatForModel(structured, 'sdxl')
    expect(prompt.split(', ').length).toBeGreaterThan(3)
    expect(prompt).toContain('no text')
  })

  it('defaults to flux', () => {
    expect(formatForModel(structured)).toEqual(formatForModel(structured, 'flux'))
  })

  it('the negative prompt always forbids text and logos', () => {
    expect(NEGATIVE_PROMPT).toContain('text')
    expect(NEGATIVE_PROMPT).toContain('logo')
  })
})

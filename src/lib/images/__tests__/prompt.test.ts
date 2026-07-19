import { describe, it, expect } from 'vitest'
import type { Palette } from '@/types/visual'
import { buildBackdropPrompt, hexToColorName, paletteWords } from '../prompt'
import { promptHash } from '../hash'

const palette: Palette = {
  surface: '#FFFFFF',
  ink: '#045650',
  accent: '#0BDA51',
  'accent-deep': '#078E35',
  line: '#DDE7E2',
}

describe('hexToColorName', () => {
  it('names hues and neutrals', () => {
    expect(hexToColorName('#FFFFFF')).toBe('white')
    expect(hexToColorName('#0BDA51')).toContain('green')
  })
})

describe('buildBackdropPrompt', () => {
  const base = { palette, mood: 'clean, modern', promptModifiers: 'photorealistic candid photography', negativePrompt: 'text, watermark' }

  it('a cover prompt includes the scene, palette hex, and a no-text rule', () => {
    const prompt = buildBackdropPrompt({ role: 'cover', scene: 'a nurse visiting a patient at home', ...base })
    expect(prompt).toContain('#0BDA51')
    expect(prompt.toLowerCase()).toContain('nurse visiting')
    expect(prompt.toLowerCase()).toContain('no text')
    expect(paletteWords(palette)).toContain('green')
  })

  it('an interior prompt is copy-free (abstract texture) so it reuses across the client', () => {
    const prompt = buildBackdropPrompt({ role: 'interior', scene: 'a nurse visiting a patient', ...base })
    expect(prompt.toLowerCase()).toContain('abstract')
    expect(prompt.toLowerCase()).not.toContain('nurse')
  })
})

describe('promptHash', () => {
  it('is stable and changes with inputs', () => {
    const a = promptHash({ preset: 'polished-photo', role: 'cover', headline: 'x' })
    expect(a).toBe(promptHash({ role: 'cover', headline: 'x', preset: 'polished-photo' })) // key-order independent
    expect(a).not.toBe(promptHash({ preset: 'modern-tech', role: 'cover', headline: 'x' }))
  })
})

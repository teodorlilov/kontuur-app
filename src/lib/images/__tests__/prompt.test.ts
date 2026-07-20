import { describe, it, expect } from 'vitest'
import type { Palette } from '@/types/visual'
import { buildBackdropPrompt, hexToColorName, paletteWords, MAX_PROMPT_CHARS } from '../prompt'
import { VIBE_PRESETS } from '@/lib/visual/vibe-presets'
import { TEXT_ZONES } from '../text-zones'
import type { BackdropRole } from '../text-zones'
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

  it('stays within fal’s 1000-char limit for every preset/role, even with a long scene + mood', () => {
    const longScene =
      'A sleek architectural pod nestled in a misty forest clearing at dusk, its geometric glass surfaces reflecting soft amber light from within, with organic tree branches and layered mist filling the foreground and edges, establishing the intersection of technology and natural beauty across the whole frame.'
    const longMood = 'Futuristic organic innovation, tech-meets-nature, aspirational and calm and premium and editorial'
    const roles = Object.keys(TEXT_ZONES) as BackdropRole[]
    for (const preset of Object.values(VIBE_PRESETS)) {
      for (const role of roles) {
        const prompt = buildBackdropPrompt({
          role,
          scene: longScene,
          palette: preset.defaultPalette,
          mood: longMood,
          promptModifiers: preset.promptModifiers,
          negativePrompt: preset.negativePrompt,
        })
        expect(prompt.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS)
      }
    }
  })

  it('collapses a scene’s trailing period so the subject never reads “..”', () => {
    const prompt = buildBackdropPrompt({ role: 'cover', scene: 'a nurse visiting a patient at home.', ...base })
    expect(prompt).not.toContain('home..')
  })
})

describe('promptHash', () => {
  it('is stable and changes with inputs', () => {
    const a = promptHash({ preset: 'polished-photo', role: 'cover', headline: 'x' })
    expect(a).toBe(promptHash({ role: 'cover', headline: 'x', preset: 'polished-photo' })) // key-order independent
    expect(a).not.toBe(promptHash({ preset: 'modern-tech', role: 'cover', headline: 'x' }))
  })
})

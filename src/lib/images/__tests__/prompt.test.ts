import { describe, expect, it } from 'vitest'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'
import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import { buildDesignPrompt, buildOperatorPrompt, buildVectorPrompt, hexToColorName, paletteWords } from '../prompt'

const brief: BrandBrief = {
  photographicSubjects: ['a sunlit modern apartment interior'],
  motifs: ['clean geometric lines'],
  mood: 'calm and aspirational',
}

const EDITORIAL_SCAFFOLD = 'A clean, refined editorial magazine composition'

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
    const parts = words.split(', ')
    expect(new Set(parts).size).toBe(parts.length)
  })
})

describe('buildDesignPrompt', () => {
  it('folds in the scaffold, the scene, the palette (with hex), and always forbids text', () => {
    const p = buildDesignPrompt({
      role: 'cover',
      scene: 'a barista pouring latte art',
      scaffold: EDITORIAL_SCAFFOLD,
      colors: DEFAULT_TOKENS.color,
      brief,
      negativeSpace: 'bottom',
    })
    expect(p).toContain(EDITORIAL_SCAFFOLD)
    expect(p).toContain('a barista pouring latte art')
    expect(p).toContain('cover slide') // role directive
    expect(p).toMatch(/#[0-9A-Fa-f]{6}/) // palette hex present
    expect(p).toMatch(/no text/i)
    expect(p).toMatch(/lower third/i) // bottom text zone → reserved negative space
    expect(p).toContain('calm and aspirational') // brief mood folded in
  })

  it('marks an interior slide and reserves centre space for a centred zone', () => {
    const p = buildDesignPrompt({
      role: 'interior',
      scene: null,
      scaffold: EDITORIAL_SCAFFOLD,
      colors: DEFAULT_TOKENS.color,
      brief,
      negativeSpace: 'center',
    })
    expect(p).toContain('interior slide')
    // No scene → the brief subject + motif fallback.
    expect(p).toContain('a sunlit modern apartment interior')
    expect(p).toContain('clean geometric lines')
    expect(p).toMatch(/central band/i)
  })

  it('degrades gracefully with a null brief and folds in the art-direction conditioning', () => {
    const p = buildDesignPrompt({
      role: 'cover',
      scene: null,
      scaffold: EDITORIAL_SCAFFOLD,
      colors: DEFAULT_TOKENS.color,
      brief: null,
      negativeSpace: 'top',
      conditioning: 'clinical, precise and restrained',
    })
    expect(p).toContain('abstract')
    expect(p).toContain('Clinical, precise and restrained')
    expect(p).toMatch(/upper third/i)
  })
})

describe('buildVectorPrompt', () => {
  it('describes a flat, on-brand, text-free mark from the motif + palette + style', () => {
    const p = buildVectorPrompt({ motif: 'a stylised coffee bean', colors: DEFAULT_TOKENS.color, feedSystemSlug: 'bold-blocks' })
    expect(p).toContain('a stylised coffee bean')
    expect(p).toContain('bold geometric') // bold-blocks vector style
    expect(p).toContain('colour palette of')
    expect(p).toMatch(/no text/i)
    expect(p).toMatch(/no gradients/i)
  })

  it('falls back to an abstract mark and editorial style with no motif / unknown system', () => {
    const p = buildVectorPrompt({ motif: '  ', colors: DEFAULT_TOKENS.color, feedSystemSlug: null })
    expect(p).toContain('abstract geometric brand mark')
    expect(p).toContain('minimal line-art') // editorial default
  })

  it('folds the art-director ornament directive into the mark character when given', () => {
    const p = buildVectorPrompt({ motif: 'a leaf', colors: DEFAULT_TOKENS.color, feedSystemSlug: 'editorial', ornament: 'soft organic rounded forms' })
    expect(p).toContain("mark's character: soft organic rounded forms")
  })

  it('omits the character clause when no ornament is given', () => {
    expect(buildVectorPrompt({ motif: 'a leaf', colors: DEFAULT_TOKENS.color, feedSystemSlug: 'editorial' })).not.toContain('character:')
  })
})

describe('buildOperatorPrompt', () => {
  it('wraps free text with palette + negative-space + no-text directives', () => {
    const p = buildOperatorPrompt('a marble kitchen counter', DEFAULT_TOKENS.color)
    expect(p).toContain('A marble kitchen counter')
    expect(p).toMatch(/colour palette of/i)
    expect(p).toMatch(/no text/i)
  })

  it('falls back to an abstract composition on empty text', () => {
    expect(buildOperatorPrompt('   ', DEFAULT_TOKENS.color)).toContain('abstract, minimal branded composition')
  })
})

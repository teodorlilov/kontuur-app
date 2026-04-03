import { describe, it, expect } from 'vitest'
import {
  getAllowedStructures,
  formatAllowedOpeners,
  formatStructures,
  formatWordCount,
  formatHashtagRules,
} from '../generation-criteria'

describe('getAllowedStructures', () => {
  it('excludes CONFESSION and STORY-FIRST for formal', () => {
    const structures = getAllowedStructures('formal')
    expect(structures).not.toContain('CONFESSION')
    expect(structures).not.toContain('STORY-FIRST')
    expect(structures).toHaveLength(4)
  })

  it('includes all 6 structures for casual', () => {
    const structures = getAllowedStructures('casual')
    expect(structures).toHaveLength(6)
    expect(structures).toContain('CONFESSION')
    expect(structures).toContain('STORY-FIRST')
  })

  it('includes all 6 structures for neutral', () => {
    const structures = getAllowedStructures('neutral')
    expect(structures).toHaveLength(6)
  })
})

const OPENER_EXAMPLES = [
  { formality: 'formal', id: 'professional_observation', description: 'Open with a specific observation from professional practice.', content: 'Patients who...' },
  { formality: 'formal', id: 'reframe', description: 'Reframe a concept from a professional perspective.', content: 'What is commonly...' },
  { formality: 'casual', id: 'specific_feeling_now', description: 'Name a very specific feeling the reader is experiencing.', content: 'That exact moment...' },
  { formality: 'casual', id: 'mid_thought', description: 'Drop the reader into the middle of a thought or scene.', content: '...and that is the moment...' },
  { formality: 'neutral', id: 'specific_detail', description: 'Open with one concrete, specific detail.', content: 'Over 65% of...' },
]

function makeLanguageConfig(formality: string) {
  return {
    language: 'English',
    formality,
    nativeCTAPhrases: '',
    carouselSwipeCues: '',
    formalityRules: null,
    languageInstructions: '',
    openerExamples: OPENER_EXAMPLES,
    languageNotes: '',
  }
}

describe('formatAllowedOpeners', () => {
  it('shows only formal openers for formal register', () => {
    const output = formatAllowedOpeners(makeLanguageConfig('formal'))
    expect(output).toContain('professional practice')
    expect(output).toContain('Reframe a concept')
    expect(output).not.toContain('middle of a thought')
  })

  it('shows only casual openers for casual register', () => {
    const output = formatAllowedOpeners(makeLanguageConfig('casual'))
    expect(output).toContain('middle of a thought')
    expect(output).toContain('specific feeling')
    expect(output).not.toContain('professional practice')
  })

  it('includes example content for each opener', () => {
    const output = formatAllowedOpeners(makeLanguageConfig('formal'))
    expect(output).toContain('Example: Patients who...')
  })

  it('returns fallback message when no openers match', () => {
    const output = formatAllowedOpeners(makeLanguageConfig('unknown'))
    expect(output).toContain('no opener types defined')
  })
})

describe('formatStructures', () => {
  it('omits CONFESSION for formal', () => {
    const output = formatStructures('formal')
    expect(output).not.toContain('CONFESSION')
    expect(output).not.toContain('STORY-FIRST')
  })

  it('includes CONFESSION for casual', () => {
    const output = formatStructures('casual')
    expect(output).toContain('CONFESSION')
    expect(output).toContain('STORY-FIRST')
  })
})

describe('formatWordCount', () => {
  it('returns range for known platform', () => {
    expect(formatWordCount('Instagram')).toBe('150-220 words')
  })

  it('returns fallback for unknown platform', () => {
    expect(formatWordCount('Unknown')).toBe('Follow platform conventions')
  })
})

describe('formatHashtagRules', () => {
  it('returns rules for known platform', () => {
    expect(formatHashtagRules('Instagram')).toContain('Max 3')
  })

  it('returns fallback for unknown platform', () => {
    expect(formatHashtagRules('Unknown')).toBe('Follow platform conventions')
  })
})

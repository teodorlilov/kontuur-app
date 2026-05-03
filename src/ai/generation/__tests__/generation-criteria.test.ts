import { describe, it, expect } from 'vitest'
import {
  ALL_POST_STRUCTURES,
  formatStructures,
  formatStructureDescriptions,
  formatWordCount,
  formatHashtagRules,
} from '@/ai/shared/content-criteria'

describe('ALL_POST_STRUCTURES', () => {
  it('includes all 5 structures', () => {
    expect(ALL_POST_STRUCTURES).toHaveLength(5)
    expect(ALL_POST_STRUCTURES).toContain('THE COUNTER-INTUITIVE TRUTH')
    expect(ALL_POST_STRUCTURES).toContain('SENSORY SNAPSHOT')
    expect(ALL_POST_STRUCTURES).toContain('THE CONTRAST')
  })
})

describe('formatStructures', () => {
  it('returns all structure names', () => {
    const output = formatStructures()
    expect(output).toContain('THE COUNTER-INTUITIVE TRUTH')
    expect(output).toContain('SENSORY SNAPSHOT')
    expect(output).toContain('THE CONTRAST')
  })
})

describe('formatStructureDescriptions', () => {
  it('returns numbered descriptions for all structures', () => {
    const output = formatStructureDescriptions()
    expect(output).toContain('1. THE COUNTER-INTUITIVE TRUTH')
    expect(output).toContain('SENSORY SNAPSHOT')
    expect(output).toContain('THE CONTRAST')
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

import { describe, it, expect } from 'vitest'
import {
  ALL_POST_STRUCTURES,
  formatStructures,
  formatStructureDescriptions,
  formatWordCount,
  formatHashtagRules,
} from '../generation-criteria'

describe('ALL_POST_STRUCTURES', () => {
  it('includes all 6 structures', () => {
    expect(ALL_POST_STRUCTURES).toHaveLength(6)
    expect(ALL_POST_STRUCTURES).toContain('STORY-FIRST')
    expect(ALL_POST_STRUCTURES).toContain('MYTH-BREAKER')
    expect(ALL_POST_STRUCTURES).toContain('CONFESSION')
  })
})

describe('formatStructures', () => {
  it('returns all structure names', () => {
    const output = formatStructures()
    expect(output).toContain('CONFESSION')
    expect(output).toContain('STORY-FIRST')
    expect(output).toContain('MYTH-BREAKER')
  })
})

describe('formatStructureDescriptions', () => {
  it('returns numbered descriptions for all structures', () => {
    const output = formatStructureDescriptions()
    expect(output).toContain('1. STORY-FIRST')
    expect(output).toContain('MYTH-BREAKER')
    expect(output).toContain('CONFESSION')
    expect(output).not.toContain('Works at any register')
    expect(output).not.toContain('FORMAL:')
    expect(output).not.toContain('CASUAL:')
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

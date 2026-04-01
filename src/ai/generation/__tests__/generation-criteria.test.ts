import { describe, it, expect } from 'vitest'
import {
  getAllowedOpenerTypes,
  getAllowedStructures,
  formatAllowedOpeners,
  formatStructures,
  formatWordCount,
  formatHashtagRules,
} from '../generation-criteria'

describe('getAllowedOpenerTypes', () => {
  it('returns 4 types for formal (no mid_thought)', () => {
    const types = getAllowedOpenerTypes('formal')
    expect(types).toHaveLength(4)
    expect(types.every((t) => t.id !== 'mid_thought')).toBe(true)
  })

  it('returns all 6 types for casual (includes mid_thought)', () => {
    const types = getAllowedOpenerTypes('casual')
    expect(types).toHaveLength(6)
    expect(types.some((t) => t.id === 'mid_thought')).toBe(true)
  })

  it('returns 5 types for neutral (no mid_thought)', () => {
    const types = getAllowedOpenerTypes('neutral')
    expect(types).toHaveLength(5)
    expect(types.every((t) => t.id !== 'mid_thought')).toBe(true)
  })

  it('falls back to neutral types for unknown formality', () => {
    const types = getAllowedOpenerTypes('unknown')
    expect(types).toHaveLength(5)
  })
})

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

describe('formatAllowedOpeners', () => {
  it('omits mid-thought for formal', () => {
    const output = formatAllowedOpeners('formal')
    expect(output).not.toContain('middle of a thought')
    expect(output).toContain('professional practice')
  })

  it('includes mid-thought for casual', () => {
    const output = formatAllowedOpeners('casual')
    expect(output).toContain('middle of a thought')
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

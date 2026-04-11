import { describe, it, expect } from 'vitest'
import { toStringArray, toCarouselSwipeCues, toFormalityRulesData } from '../language-rules'

describe('toStringArray', () => {
  it('returns empty array for null', () => {
    expect(toStringArray(null)).toEqual([])
  })

  it('returns empty array for undefined', () => {
    expect(toStringArray(undefined)).toEqual([])
  })

  it('returns empty array for non-array value', () => {
    expect(toStringArray('not an array')).toEqual([])
    expect(toStringArray(42)).toEqual([])
    expect(toStringArray({ key: 'value' })).toEqual([])
  })

  it('returns string items from mixed array', () => {
    expect(toStringArray(['hello', 42, 'world', null, true])).toEqual(['hello', 'world'])
  })

  it('returns all strings from string-only array', () => {
    expect(toStringArray(['тренд', 'импакт', 'бранд'])).toEqual(['тренд', 'импакт', 'бранд'])
  })

  it('returns empty array for empty array', () => {
    expect(toStringArray([])).toEqual([])
  })
})

describe('toCarouselSwipeCues', () => {
  it('returns empty string for null', () => {
    expect(toCarouselSwipeCues(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(toCarouselSwipeCues(undefined)).toBe('')
  })

  it('returns carousel_swipe property if present', () => {
    expect(toCarouselSwipeCues({ carousel_swipe: 'Плъзнете →', other: 'ignored' })).toBe(
      'Плъзнете →'
    )
  })

  it('joins object values when no carousel_swipe', () => {
    expect(toCarouselSwipeCues({ cue1: 'Плъзнете', cue2: 'Още' })).toBe('Плъзнете, Още')
  })

  it('returns empty string for non-object', () => {
    expect(toCarouselSwipeCues('plain string')).toBe('')
    expect(toCarouselSwipeCues(42)).toBe('')
  })

  it('returns empty string for arrays', () => {
    expect(toCarouselSwipeCues(['a', 'b'])).toBe('')
  })
})

describe('toFormalityRulesData', () => {
  it('returns null for null/undefined', () => {
    expect(toFormalityRulesData(null)).toBeNull()
    expect(toFormalityRulesData(undefined)).toBeNull()
  })

  it('returns null for non-object', () => {
    expect(toFormalityRulesData('string')).toBeNull()
    expect(toFormalityRulesData(42)).toBeNull()
  })

  it('returns null for arrays', () => {
    expect(toFormalityRulesData([1, 2])).toBeNull()
  })

  it('returns null when registers key is missing', () => {
    expect(toFormalityRulesData({ other: 'data' })).toBeNull()
  })

  it('returns data when registers key is present', () => {
    const data = { registers: { formal: { rules: ['Be polite'], examples: {} } } }
    const result = toFormalityRulesData(data)
    expect(result).toEqual(data)
    expect(result!.registers.formal!.rules).toEqual(['Be polite'])
  })
})

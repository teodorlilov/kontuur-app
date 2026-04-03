import { describe, it, expect } from 'vitest'
import { toStringArray, toCTAPhrases, toCarouselSwipeCues, toFormalityRulesData, toOpenerExamples } from '../language-rules'

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

describe('toCTAPhrases', () => {
  it('returns empty string for null', () => {
    expect(toCTAPhrases(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(toCTAPhrases(undefined)).toBe('')
  })

  it('returns string value directly', () => {
    expect(toCTAPhrases('Запишете се сега')).toBe('Запишете се сега')
  })

  it('joins object values with comma', () => {
    expect(toCTAPhrases({ primary: 'Запишете се', secondary: 'Научете повече' }))
      .toBe('Запишете се, Научете повече')
  })

  it('returns empty string for arrays', () => {
    expect(toCTAPhrases(['a', 'b'])).toBe('')
  })

  it('returns empty string for boolean/number', () => {
    expect(toCTAPhrases(true)).toBe('')
    expect(toCTAPhrases(0)).toBe('')
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
    expect(toCarouselSwipeCues({ carousel_swipe: 'Плъзнете →', other: 'ignored' }))
      .toBe('Плъзнете →')
  })

  it('joins object values when no carousel_swipe', () => {
    expect(toCarouselSwipeCues({ cue1: 'Плъзнете', cue2: 'Още' }))
      .toBe('Плъзнете, Още')
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

describe('toOpenerExamples', () => {
  it('returns empty array for null/undefined', () => {
    expect(toOpenerExamples(null)).toEqual([])
    expect(toOpenerExamples(undefined)).toEqual([])
  })

  it('returns empty array for non-array', () => {
    expect(toOpenerExamples('string')).toEqual([])
    expect(toOpenerExamples({ key: 'value' })).toEqual([])
  })

  it('filters valid opener examples', () => {
    const input = [
      { formality: 'formal', id: 'professional_observation', description: 'Open with a specific observation.', content: 'Patients who...' },
      { formality: 'casual', id: 'unexpected_fact', description: 'State an unexpected fact.', content: 'Did you know...' },
      { formality: 'formal', id: 'no_description', content: 'Missing description field' },
      { missing: 'fields' },
      42,
      null,
    ]
    const result = toOpenerExamples(input)
    expect(result).toHaveLength(2)
    expect(result[0]!.formality).toBe('formal')
    expect(result[1]!.id).toBe('unexpected_fact')
  })

  it('returns empty array for empty array', () => {
    expect(toOpenerExamples([])).toEqual([])
  })
})

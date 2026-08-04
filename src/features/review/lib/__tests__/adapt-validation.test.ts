import { describe, it, expect } from 'vitest'
import { fallbackValidationData, needsSlopFallback, toValidationData } from '../adapt-validation'

const scores = { overall_score: 8, human_score: 7, language_score: 9, source_score: null }
const criteria = {
  ai_tells: ['in today world'],
  worst_offending_phrase: 'in today world',
  source_claims: null,
  health_compliant: null,
  issues: [],
  structure_followed: null,
}

describe('toValidationData — rows written before slop/language were persisted', () => {
  it('reconstructs slop from the stored scores', () => {
    const data = toValidationData({ scores, criteria })
    expect(data?.slop.human_authenticity_score).toBe(7)
    expect(data?.slop.ai_tells_found).toEqual(['in today world'])
  })

  it('renders an empty language receipt — the fixes were applied but never stored', () => {
    const data = toValidationData({ scores, criteria })
    expect(data?.language.issues).toEqual([])
    expect(data?.sourceGrounding).toBeUndefined()
  })
})

describe('toValidationData — rows with the full evidence trail', () => {
  const slop = {
    reads_as_human: false,
    ai_tells_found: ['x'],
    worst_offending_phrase: 'x',
    human_authenticity_score: 5,
  }
  const language = {
    passes: false,
    language_score: 8,
    issues: [
      { type: 'calque', original_text: 'a', issue_description: 'b', suggested_fix: 'c' },
    ],
  }
  const sourceGrounding = {
    grounded: true,
    grounding_score: 9,
    flagged_claims: [{ claim: 'rate hit 6.58%', status: 'grounded', source_evidence: 'quote' }],
  }

  it('prefers stored sections over reconstruction', () => {
    const data = toValidationData({ scores, criteria, slop, language, sourceGrounding })
    expect(data?.slop).toEqual(slop)
    expect(data?.language.issues).toHaveLength(1)
    expect(data?.sourceGrounding?.flagged_claims[0]?.claim).toBe('rate hit 6.58%')
  })
})

describe('toValidationData — garbage', () => {
  it('returns null so the shell can substitute the fallback', () => {
    expect(toValidationData(null)).toBeNull()
    expect(toValidationData('junk')).toBeNull()
  })
})

describe('needsSlopFallback', () => {
  it('true only when neither stored slop nor a human score exists', () => {
    expect(needsSlopFallback({ scores: { ...scores, human_score: 0 }, criteria })).toBe(true)
    expect(needsSlopFallback({ scores, criteria })).toBe(false)
    expect(needsSlopFallback(null)).toBe(true)
  })
})

describe('fallbackValidationData', () => {
  it('carries the row-level quality score and nothing invented', () => {
    const data = fallbackValidationData(6)
    expect(data.scores.overall_score).toBe(6)
    expect(data.criteria.ai_tells).toEqual([])
    expect(data.slop.human_authenticity_score).toBe(0)
  })
})

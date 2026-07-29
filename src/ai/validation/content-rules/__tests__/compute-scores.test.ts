import { describe, it, expect } from 'vitest'
import {
  computeLanguageScore,
  computeGroundingScore,
  deriveSlopFromQuality,
} from '../compute-scores'
import type { LanguageIssueType } from '@/ai/validation/types'

// ---------------------------------------------------------------------------
// Language scoring
// ---------------------------------------------------------------------------

describe('computeLanguageScore', () => {
  it('returns 10 and passes when no issues', () => {
    const result = computeLanguageScore({ issues: [] })
    expect(result.language_score).toBe(10)
    expect(result.passes).toBe(true)
  })

  it('returns 10 when corrected flag is set', () => {
    const result = computeLanguageScore({
      issues: [{ type: 'grammar' }, { type: 'calque' }],
      corrected: true,
    })
    expect(result.language_score).toBe(10)
    expect(result.passes).toBe(true)
  })

  it('deducts 1.5 for a grammar issue', () => {
    const result = computeLanguageScore({ issues: [{ type: 'grammar' }] })
    expect(result.language_score).toBe(9) // round(10 - 1.5) = 9
    expect(result.passes).toBe(false) // has issues → fails
  })

  it('deducts 2.0 for a mixed_script issue', () => {
    const result = computeLanguageScore({ issues: [{ type: 'mixed_script' }] })
    expect(result.language_score).toBe(8)
    expect(result.passes).toBe(false)
  })

  it('deducts correctly for multiple issues', () => {
    const result = computeLanguageScore({
      issues: [
        { type: 'anglicism' }, // -1.0
        { type: 'calque' }, // -1.5
        { type: 'grammar' }, // -1.5
      ],
    })
    expect(result.language_score).toBe(6) // round(10 - 4.0) = 6
    expect(result.passes).toBe(false)
  })

  it('clamps to minimum of 1', () => {
    const result = computeLanguageScore({
      issues: [
        { type: 'mixed_script' }, // -2.0
        { type: 'mixed_script' }, // -2.0
        { type: 'grammar' }, // -1.5
        { type: 'grammar' }, // -1.5
        { type: 'calque' }, // -1.5
        { type: 'calque' }, // -1.5
      ],
    })
    expect(result.language_score).toBe(1) // 10 - 10.0 = 0 → clamped to 1
    expect(result.passes).toBe(false)
  })

  it('applies correct weight for each issue type', () => {
    const weights: [LanguageIssueType, number][] = [
      ['grammar', 1.5],
      ['mixed_script', 2.0],
      ['calque', 1.5],
      ['anglicism', 1.0],
      ['formality', 1.0],
      ['register', 0.75],
      ['vocabulary', 1.0],
    ]

    for (const [type, weight] of weights) {
      const result = computeLanguageScore({ issues: [{ type }] })
      expect(result.language_score).toBe(Math.max(1, Math.round(10 - weight)))
    }
  })

  it('passes only when score >= 8 AND zero issues', () => {
    // Score 9 but has an issue → fails
    const withIssue = computeLanguageScore({ issues: [{ type: 'register' }] })
    expect(withIssue.language_score).toBe(9) // round(10 - 0.75) = 9
    expect(withIssue.passes).toBe(false)

    // No issues → passes
    const noIssues = computeLanguageScore({ issues: [] })
    expect(noIssues.passes).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Grounding scoring
// ---------------------------------------------------------------------------

describe('computeGroundingScore', () => {
  it('returns 10 and grounded when no claims', () => {
    const result = computeGroundingScore({ flagged_claims: [] })
    expect(result.grounding_score).toBe(10)
    expect(result.grounded).toBe(true)
  })

  it('returns 10 when all claims are grounded', () => {
    const result = computeGroundingScore({
      flagged_claims: [{ status: 'grounded' }, { status: 'grounded' }, { status: 'grounded' }],
    })
    expect(result.grounding_score).toBe(10)
    expect(result.grounded).toBe(true)
  })

  it('returns lower score for partially grounded claims', () => {
    const result = computeGroundingScore({
      flagged_claims: [{ status: 'grounded' }, { status: 'partially_grounded' }],
    })
    // 10 * (1 + 0.5) / 2 = 7.5 → 8
    expect(result.grounding_score).toBe(8)
    expect(result.grounded).toBe(false)
  })

  it('returns lower score for ungrounded claims', () => {
    const result = computeGroundingScore({
      flagged_claims: [{ status: 'grounded' }, { status: 'ungrounded' }],
    })
    // 10 * (1 + 0) / 2 = 5
    expect(result.grounding_score).toBe(5)
    expect(result.grounded).toBe(false)
  })

  it('returns 1 when all claims are ungrounded', () => {
    const result = computeGroundingScore({
      flagged_claims: [{ status: 'ungrounded' }, { status: 'ungrounded' }],
    })
    // 10 * 0 / 2 = 0 → clamped to 1
    expect(result.grounding_score).toBe(1)
    expect(result.grounded).toBe(false)
  })

  it('handles mixed claim statuses', () => {
    const result = computeGroundingScore({
      flagged_claims: [
        { status: 'grounded' },
        { status: 'partially_grounded' },
        { status: 'ungrounded' },
        { status: 'grounded' },
      ],
    })
    // 10 * (2 + 0.5) / 4 = 6.25 → 6
    expect(result.grounding_score).toBe(6)
    expect(result.grounded).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Slop derivation
// ---------------------------------------------------------------------------

describe('deriveSlopFromQuality', () => {
  it('marks as human when score >= threshold', () => {
    const result = deriveSlopFromQuality({
      human_score: 8,
      ai_tells: [],
      worst_offending_phrase: null,
    })
    expect(result.reads_as_human).toBe(true)
    expect(result.human_authenticity_score).toBe(8)
  })

  it('marks as not human when score < threshold', () => {
    const result = deriveSlopFromQuality({
      human_score: 5,
      ai_tells: ['generic enthusiasm'],
      worst_offending_phrase: 'unlock your potential',
    })
    expect(result.reads_as_human).toBe(false)
    expect(result.ai_tells_found).toEqual(['generic enthusiasm'])
    expect(result.worst_offending_phrase).toBe('unlock your potential')
    expect(result.human_authenticity_score).toBe(5)
  })
})

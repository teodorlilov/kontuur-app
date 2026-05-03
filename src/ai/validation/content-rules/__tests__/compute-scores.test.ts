import { describe, it, expect } from 'vitest'
import {
  computeLanguageScore,
  computeQualityScores,
  computeCriteriaScore,
  computeGroundingScore,
  deriveSlopFromQuality,
  safeParseHookVerdict,
  safeParseCtaVerdict,
  type QualityDetections,
  type CriteriaDetections,
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
// Quality scoring
// ---------------------------------------------------------------------------

function baseDetections(overrides?: Partial<QualityDetections>): QualityDetections {
  return {
    ai_tells: [],
    issues: [],
    hook_verdict: 'stops_scroll',
    cta_verdict: 'natural_specific',
    brand_voice_match: true,
    audience_targeting: true,
    niche_specificity: true,
    ...overrides,
  }
}

describe('computeQualityScores', () => {
  it('returns perfect scores with no issues', () => {
    const result = computeQualityScores(baseDetections())
    expect(result.human_score).toBe(10)
    expect(result.hook_score).toBe(10)
    expect(result.cta_score).toBe(10)
    expect(result.quality_score_avg).toBe(10)
  })

  it('penalizes human_score by 1 per AI tell', () => {
    const result = computeQualityScores(
      baseDetections({
        ai_tells: ['generic enthusiasm', 'power words without proof'],
      })
    )
    expect(result.human_score).toBe(8) // 10 - 2
  })

  it('penalizes human_score for brand voice mismatch', () => {
    const result = computeQualityScores(baseDetections({ brand_voice_match: false }))
    expect(result.human_score).toBe(9) // round(10 - 1.5) = 9
  })

  it('penalizes human_score for missing niche specificity', () => {
    const result = computeQualityScores(baseDetections({ niche_specificity: false }))
    expect(result.human_score).toBe(9) // round(10 - 1.5) = 9
  })

  it('penalizes human_score for quality issues', () => {
    const result = computeQualityScores(
      baseDetections({
        issues: [
          { type: 'no_personality' }, // -1.5
          { type: 'too_polished' }, // -1.0
        ],
      })
    )
    expect(result.human_score).toBe(8) // round(10 - 2.5) = 8
  })

  it('maps hook verdict to correct base score', () => {
    const verdicts: Array<
      [
        typeof baseDetections extends (o?: infer T) => infer R
          ? Parameters<typeof computeQualityScores>[0]['hook_verdict']
          : never,
        number,
      ]
    > = [
      ['stops_scroll', 10],
      ['clear_value', 8],
      ['generic', 5],
      ['buries_lead', 3],
      ['no_hook', 1],
    ]
    for (const [verdict, expected] of verdicts) {
      const result = computeQualityScores(baseDetections({ hook_verdict: verdict }))
      expect(result.hook_score).toBe(expected)
    }
  })

  it('maps CTA verdict to correct base score', () => {
    const verdicts: Array<
      [
        typeof baseDetections extends (o?: infer T) => infer R
          ? Parameters<typeof computeQualityScores>[0]['cta_verdict']
          : never,
        number,
      ]
    > = [
      ['natural_specific', 10],
      ['clear_relevant', 8],
      ['generic', 5],
      ['weak_mismatched', 3],
      ['missing', 1],
    ]
    for (const [verdict, expected] of verdicts) {
      const result = computeQualityScores(baseDetections({ cta_verdict: verdict }))
      expect(result.cta_score).toBe(expected)
    }
  })

  it('penalizes hook score for hook issues', () => {
    const result = computeQualityScores(
      baseDetections({
        hook_verdict: 'clear_value',
        issues: [{ type: 'weak_hook' }, { type: 'buried_lead' }],
      })
    )
    expect(result.hook_score).toBe(6) // 8 - 1 - 1
  })

  it('penalizes CTA score for CTA issues', () => {
    const result = computeQualityScores(
      baseDetections({
        cta_verdict: 'clear_relevant',
        issues: [{ type: 'generic_cta' }],
      })
    )
    expect(result.cta_score).toBe(7) // 8 - 1
  })

  it('computes quality_score_avg as 4-way rounded average', () => {
    const result = computeQualityScores(
      baseDetections({
        hook_verdict: 'generic', // 5
        cta_verdict: 'clear_relevant', // 8
        // human = 10, hook = 5, cta = 8, criteria = 10 (default) → avg = 8.25 → 8
      })
    )
    expect(result.quality_score_avg).toBe(8)
  })

  it('includes criteria_score in 4-way average when provided', () => {
    const result = computeQualityScores(baseDetections(), 6)
    // human = 10, hook = 10, cta = 10, criteria = 6 → avg = 9
    expect(result.quality_score_avg).toBe(9)
    expect(result.criteria_score).toBe(6)
  })

  it('clamps all scores to minimum 1', () => {
    const result = computeQualityScores(
      baseDetections({
        ai_tells: Array(15).fill('tell'), // -4 (capped) on human
        hook_verdict: 'no_hook',
        cta_verdict: 'missing',
        brand_voice_match: false, // -1.5
        niche_specificity: false, // -1.5
      })
    )
    // human: 10 - 4 (cap) - 1.5 - 1.5 = 3
    expect(result.human_score).toBe(3)
    expect(result.hook_score).toBe(1)
    expect(result.cta_score).toBe(1)
    // 4-way avg: (3+1+1+10)/4 = 3.75 → 4 (criteria_score defaults to 10)
    expect(result.quality_score_avg).toBe(4)
  })

  it('combines multiple penalties on human_score', () => {
    const result = computeQualityScores(
      baseDetections({
        ai_tells: ['tell1', 'tell2'], // -2
        brand_voice_match: false, // -1.5
        niche_specificity: false, // -1.5
        audience_targeting: false, // -1.0
        issues: [{ type: 'no_personality' }], // -1.5
      })
    )
    expect(result.human_score).toBe(3) // round(10 - 7.5) = 3
  })

  it('penalizes human_score for audience_targeting false (bug fix)', () => {
    const result = computeQualityScores(baseDetections({ audience_targeting: false }))
    expect(result.human_score).toBe(9) // round(10 - 1.0) = 9
  })

  it('penalizes human_score for off_brand issue (bug fix)', () => {
    const result = computeQualityScores(
      baseDetections({
        issues: [{ type: 'off_brand' }],
      })
    )
    expect(result.human_score).toBe(9) // round(10 - 1.5) = 9
  })

  it('penalizes human_score for wrong_audience issue (bug fix)', () => {
    const result = computeQualityScores(
      baseDetections({
        issues: [{ type: 'wrong_audience' }],
      })
    )
    expect(result.human_score).toBe(9) // round(10 - 1.0) = 9
  })
})

// ---------------------------------------------------------------------------
// CTA scoring
// ---------------------------------------------------------------------------

describe('CTA scoring', () => {
  it('penalizes missing CTA', () => {
    const result = computeQualityScores(
      baseDetections({
        cta_verdict: 'missing',
      })
    )
    expect(result.cta_score).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Criteria scoring
// ---------------------------------------------------------------------------

function baseCriteriaDetections(overrides?: Partial<CriteriaDetections>): CriteriaDetections {
  return {
    formality_consistent: true,
    source_fidelity_ok: null,
    health_compliant: null,
    ...overrides,
  }
}

describe('computeCriteriaScore', () => {
  it('returns 10 with all passing', () => {
    expect(computeCriteriaScore(baseCriteriaDetections())).toBe(10)
  })

  it('penalizes formality violation (-1.5)', () => {
    expect(computeCriteriaScore(baseCriteriaDetections({ formality_consistent: false }))).toBe(9)
  })

  it('penalizes source fidelity failure (-1.5)', () => {
    expect(computeCriteriaScore(baseCriteriaDetections({ source_fidelity_ok: false }))).toBe(9)
  })

  it('does not penalize when source_fidelity_ok is null', () => {
    expect(computeCriteriaScore(baseCriteriaDetections({ source_fidelity_ok: null }))).toBe(10)
  })

  it('penalizes health compliance failure (-2.0)', () => {
    expect(computeCriteriaScore(baseCriteriaDetections({ health_compliant: false }))).toBe(8)
  })

  it('does not penalize when health_compliant is null', () => {
    expect(computeCriteriaScore(baseCriteriaDetections({ health_compliant: null }))).toBe(10)
  })

  it('accumulates multiple penalties', () => {
    expect(
      computeCriteriaScore(
        baseCriteriaDetections({
          formality_consistent: false, // -1.5
          source_fidelity_ok: false, // -1.5
        })
      )
    ).toBe(7) // 10 - 3.0 = 7
  })

  it('clamps to minimum 1', () => {
    expect(
      computeCriteriaScore(
        baseCriteriaDetections({
          formality_consistent: false, // -1.5
          health_compliant: false, // -2.0
          source_fidelity_ok: false, // -1.5
        })
      )
    ).toBe(5) // 10 - 5.0 = 5
  })
})

// ---------------------------------------------------------------------------
// Safe parse verdicts
// ---------------------------------------------------------------------------

describe('safeParseHookVerdict', () => {
  it('returns valid verdicts unchanged', () => {
    expect(safeParseHookVerdict('stops_scroll')).toBe('stops_scroll')
    expect(safeParseHookVerdict('no_hook')).toBe('no_hook')
  })

  it('defaults to generic for invalid values', () => {
    expect(safeParseHookVerdict('invalid')).toBe('generic')
    expect(safeParseHookVerdict(null)).toBe('generic')
    expect(safeParseHookVerdict(42)).toBe('generic')
    expect(safeParseHookVerdict(undefined)).toBe('generic')
  })
})

describe('safeParseCtaVerdict', () => {
  it('returns valid verdicts unchanged', () => {
    expect(safeParseCtaVerdict('natural_specific')).toBe('natural_specific')
    expect(safeParseCtaVerdict('missing')).toBe('missing')
  })

  it('defaults to generic for invalid values', () => {
    expect(safeParseCtaVerdict('invalid')).toBe('generic')
    expect(safeParseCtaVerdict(null)).toBe('generic')
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

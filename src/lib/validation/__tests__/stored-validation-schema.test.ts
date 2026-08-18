import { describe, it, expect } from 'vitest'
import { buildStoredValidation, parseStoredValidation } from '../stored-validation-schema'

const scores = { overall_score: 8, human_score: 7, language_score: 9, source_score: null }

describe('parseStoredValidation — the retired checklist shape', () => {
  // Two thirds of stored rows carry this. The quality panel read `.notes` straight off it and
  // crashed with "Cannot read properties of undefined (reading 'map')".
  const legacy = {
    scores,
    criteria: {
      ai_tells: [],
      worst_offending_phrase: null,
      source_claims: null,
      health_compliant: null,
      issues: [],
      structure_followed: {
        passes: false,
        checks: [
          {
            rule: 'Each slide covers a DISTINCT idea',
            note: 'Slides 1 and 2 repeat.',
            passes: false,
          },
          { rule: 'Slide bodies are tight', note: 'Both acceptable.', passes: true },
          { rule: 'Headlines name a mechanism', note: 'Slide 1 is a topic label.', passes: false },
        ],
      },
    },
  }

  it('normalises checks into notes so the panel can render', () => {
    const parsed = parseStoredValidation(legacy)
    expect(parsed?.criteria.structure_followed?.notes).toEqual([
      'Slides 1 and 2 repeat.',
      'Slide 1 is a topic label.',
    ])
  })

  it('keeps only the failing checks — a passing rule explains nothing', () => {
    const notes = parseStoredValidation(legacy)?.criteria.structure_followed?.notes ?? []
    expect(notes).not.toContain('Both acceptable.')
  })

  it('preserves the overall verdict', () => {
    expect(parseStoredValidation(legacy)?.criteria.structure_followed?.passes).toBe(false)
  })
})

describe('parseStoredValidation — current shape', () => {
  it('passes notes through untouched', () => {
    const parsed = parseStoredValidation({
      scores,
      criteria: {
        ai_tells: ['listicle cadence'],
        worst_offending_phrase: 'in today world',
        source_claims: null,
        health_compliant: null,
        issues: [{ type: 'tone', description: 'too formal' }],
        structure_followed: { passes: false, notes: ['Slide 2 repeats slide 1.'] },
      },
    })
    expect(parsed?.criteria.structure_followed?.notes).toEqual(['Slide 2 repeats slide 1.'])
    expect(parsed?.criteria.ai_tells).toEqual(['listicle cadence'])
  })

  it('keeps a null structure verdict null — single posts have no carousel structure', () => {
    const parsed = parseStoredValidation({
      scores,
      criteria: {
        ai_tells: [],
        worst_offending_phrase: null,
        source_claims: null,
        health_compliant: null,
        issues: [],
        structure_followed: null,
      },
    })
    expect(parsed?.criteria.structure_followed).toBeNull()
  })
})

describe('parseStoredValidation — degrades instead of throwing', () => {
  it('defaults missing arrays, because consumers read .length on them', () => {
    const parsed = parseStoredValidation({ scores, criteria: { structure_followed: null } })
    expect(parsed?.criteria.ai_tells).toEqual([])
    expect(parsed?.criteria.issues).toEqual([])
  })

  it('returns null for junk rather than a half-built object', () => {
    expect(parseStoredValidation(null)).toBeNull()
    expect(parseStoredValidation('nonsense')).toBeNull()
    expect(parseStoredValidation({})).toBeNull()
    expect(parseStoredValidation({ scores })).toBeNull()
  })

  it('survives an unrecognised structure shape by dropping the verdict', () => {
    const parsed = parseStoredValidation({
      scores,
      criteria: { ai_tells: [], issues: [], structure_followed: { passes: false, wat: 1 } },
    })
    expect(parsed?.criteria.structure_followed).toBeNull()
  })
})

describe('parseStoredValidation — the evidence trail (2026-08 optional fields)', () => {
  const criteria = {
    ai_tells: [],
    worst_offending_phrase: null,
    source_claims: null,
    health_compliant: null,
    issues: [],
    structure_followed: null,
  }
  const slop = {
    reads_as_human: false,
    ai_tells_found: ['in today world'],
    worst_offending_phrase: 'in today world',
    human_authenticity_score: 5,
  }
  const language = {
    passes: false,
    language_score: 8,
    issues: [
      {
        type: 'calque' as const,
        original_text: 'правя смисъл',
        issue_description: 'calqued from English',
        suggested_fix: 'има смисъл',
      },
    ],
  }

  it('rows without the new fields parse exactly as before — they stay absent', () => {
    const parsed = parseStoredValidation({ scores, criteria })
    expect(parsed?.slop).toBeUndefined()
    expect(parsed?.language).toBeUndefined()
    expect(parsed?.sourceGrounding).toBeUndefined()
  })

  it('stored slop and language pass through verbatim', () => {
    const parsed = parseStoredValidation({ scores, criteria, slop, language })
    expect(parsed?.slop).toEqual(slop)
    expect(parsed?.language).toEqual(language)
  })

  it('a malformed optional section degrades to absent, never fails the parse', () => {
    const parsed = parseStoredValidation({ scores, criteria, slop: 'garbage', language: 42 })
    expect(parsed).not.toBeNull()
    expect(parsed?.slop).toBeUndefined()
    expect(parsed?.language).toBeUndefined()
  })

  it('an unknown claim status degrades to the warn rendering, never to "matched"', () => {
    const parsed = parseStoredValidation({
      scores,
      criteria,
      sourceGrounding: {
        grounded: true,
        grounding_score: 9,
        flagged_claims: [{ claim: 'x', status: 'certified', source_evidence: null }],
      },
    })
    expect(parsed?.sourceGrounding?.flagged_claims[0]?.status).toBe('partially_grounded')
  })

  it('buildStoredValidation round-trips through the parser and drops the corrections', () => {
    const built = buildStoredValidation({
      criteria,
      scores,
      slop,
      language: { ...language, corrected_text: 'corrected', corrected_slides: null },
      sourceGrounding: {
        grounded: false,
        grounding_score: 6,
        flagged_claims: [
          { claim: 'rate is 6.58%', status: 'partially_grounded' as const, source_evidence: null },
        ],
      },
    })
    expect(built.language).not.toHaveProperty('corrected_text')
    expect(built.sourceGrounding).not.toHaveProperty('corrected_text')
    expect(parseStoredValidation(built)).toEqual(built)
  })
})

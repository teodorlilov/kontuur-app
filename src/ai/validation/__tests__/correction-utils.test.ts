import { describe, it, expect } from 'vitest'
import { applyPostCorrections, applySlideCorrections } from '../correction-utils'
import type { LanguageIssue, LanguageValidationResult } from '../types'
import type { PostValidationResult } from '../validate-post'

function issue(original_text: string, suggested_fix: string): LanguageIssue {
  return { type: 'anglicism', original_text, issue_description: 'non-native', suggested_fix }
}

/** Only language and scores are read by the correction utils; cast documents the gap. */
function makeValidation(language: Partial<LanguageValidationResult>): PostValidationResult {
  return {
    language: { passes: false, language_score: 6, issues: [], corrected_text: null, ...language },
    scores: { overall_score: 8, human_score: 8, language_score: 6, source_score: null },
  } as unknown as PostValidationResult
}

describe('applyPostCorrections', () => {
  it('a full rewrite from the judge wins outright and everything counts as applied', () => {
    const validation = makeValidation({
      corrected_text: 'Пренаписан текст.',
      issues: [issue('lead quality', 'качество на запитванията')],
    })
    const applied = applyPostCorrections('Оригинал с lead quality.', null, validation)
    expect(applied.caption).toBe('Пренаписан текст.')
    expect(applied.validation.language.issues[0]!.applied).toBe(true)
    expect(applied.validation.language.language_score).toBe(10)
    expect(applied.validation.scores.language_score).toBe(10)
  })

  it('per-issue fixes ship when the judge reported issues without a rewrite — and score as clean', () => {
    // The merged judge's most common failure: language_issues populated,
    // corrected_text null — the found fixes must still ship, and once they
    // have, the verdict must describe the fixed text, not the draft. This is
    // the "13 fixes applied, language score 1" bug.
    const validation = makeValidation({
      issues: [
        issue('lead quality биха', 'качеството на запитванията беше приоритет за'),
        issue('ранкирането', 'класирането'),
      ],
    })
    const applied = applyPostCorrections(
      'През 2026 lead quality биха 39%. Това влияе на ранкирането.',
      null,
      validation
    )
    expect(applied.caption).toBe(
      'През 2026 качеството на запитванията беше приоритет за 39%. Това влияе на класирането.'
    )
    expect(applied.validation.language.issues.every((i) => i.applied)).toBe(true)
    expect(applied.validation.language.language_score).toBe(10)
    expect(applied.validation.language.passes).toBe(true)
  })

  it('a misquoted phrase does not match — text left alone, issue kept against the score', () => {
    const validation = makeValidation({ issues: [issue('not present in text', 'заместител')] })
    const applied = applyPostCorrections('Чист текст.', null, validation)
    expect(applied.caption).toBe('Чист текст.')
    expect(applied.validation.language.issues[0]!.applied).toBe(false)
    // The unappliable issue still penalises: nothing was actually fixed.
    expect(applied.validation.language.language_score).toBeLessThan(10)
    expect(applied.validation.language.passes).toBe(false)
  })

  it('empty and identity fixes cannot be applied and stay flagged', () => {
    const validation = makeValidation({
      issues: [issue('', 'x'), issue('текст', 'текст')],
    })
    const applied = applyPostCorrections('Чист текст.', null, validation)
    expect(applied.caption).toBe('Чист текст.')
    expect(applied.validation.language.issues.every((i) => i.applied === false)).toBe(true)
  })

  it('a slide-only phrase counts as applied for a carousel', () => {
    const validation = makeValidation({
      issues: [issue('engagement rate', 'ангажираност')],
    })
    const applied = applyPostCorrections(
      'Чиста каптура.',
      [{ headline: 'Cover с engagement rate', body: '' }],
      validation
    )
    expect(applied.slides![0]!.headline).toBe('Cover с ангажираност')
    expect(applied.validation.language.issues[0]!.applied).toBe(true)
    expect(applied.validation.language.language_score).toBe(10)
  })

  it('an issue-free verdict passes through untouched', () => {
    const validation = makeValidation({ issues: [], language_score: null, passes: true })
    const applied = applyPostCorrections('Чист текст.', null, validation)
    expect(applied.validation).toBe(validation)
  })
})

describe('applySlideCorrections', () => {
  const slides = [
    { headline: 'Cover с engagement rate', body: '', slide_number: 1 },
    { headline: 'Точка', body: 'Следете вашия engagement rate всяка седмица.', slide_number: 2 },
  ]

  it('corrected_slides from the judge win outright, preserving extra fields', () => {
    const fixed = applySlideCorrections(
      slides,
      [
        { headline: 'Нов', body: '' },
        { headline: 'Нова точка', body: 'Ново тяло.' },
      ],
      [issue('engagement rate', 'ангажираност')]
    )
    expect(fixed[1]).toEqual({ headline: 'Нова точка', body: 'Ново тяло.', slide_number: 2 })
  })

  it('falls back to per-issue fixes across headline and body', () => {
    const fixed = applySlideCorrections(slides, null, [issue('engagement rate', 'ангажираност')])
    expect(fixed[0]!.headline).toBe('Cover с ангажираност')
    expect(fixed[1]!.body).toBe('Следете вашия ангажираност всяка седмица.')
    expect(fixed[1]!.slide_number).toBe(2)
  })

  it('returns the slides untouched when there is nothing to apply', () => {
    expect(applySlideCorrections(slides, null, [])).toBe(slides)
    expect(applySlideCorrections(slides, undefined)).toBe(slides)
  })

  it('ignores a corrected_slides that arrived as a JSON string instead of an array', () => {
    // Neither judge's schema is enforced. A stringified payload used to pass the
    // truthy check and get INDEXED, handing each slide a single character whose
    // .headline is undefined — every slide shipped blank.
    const corrupt = '[{"headline":"Нов","body":""}]' as unknown as Array<{
      headline: string
      body: string
    }>

    const fixed = applySlideCorrections(slides, corrupt, [])

    expect(fixed).toEqual(slides)
    expect(fixed[0]!.headline).toBe('Cover с engagement rate')
  })

  it('keeps a slide whose correction entry is missing headline or body', () => {
    const partial = [{ headline: 'Нов', body: '' }, { headline: 'Само заглавие' }] as Array<{
      headline: string
      body: string
    }>

    const fixed = applySlideCorrections(slides, partial, [])

    expect(fixed[0]!.headline).toBe('Нов')
    expect(fixed[1]).toEqual(slides[1])
  })
})

import { describe, expect, it } from 'vitest'
import { buildBrandSuggestions } from '../brand-suggestion'
import type { UrlAnalysisResponse } from '@/types/api'

/**
 * The rules that decide what a re-read is allowed to propose on a profile someone already edited.
 *
 * Two of these guard data the user cannot see going: pillar ids, which every source's `pillar_ids`
 * points at, and the fields excluded from the list entirely.
 */
function analysis(overrides: Partial<UrlAnalysisResponse> = {}): UrlAnalysisResponse {
  return {
    detected_business_name: 'Acme Studio',
    detected_niche: 'Dental clinic',
    detected_niche_confidence: 'high',
    detected_target_audience: ['Families', 'Young professionals'],
    detected_tone: 'Warm and reassuring',
    detected_content_pillars: [
      { pillar: 'Patient stories', weight: 60 },
      { pillar: 'Treatments explained', weight: 40 },
    ],
    detected_services_products: ['Implants'],
    detected_language: 'Bulgarian',
    detected_language_formality: 'formal',
    detected_is_health_niche: true,
    detected_avoid_topics: 'Price comparisons',
    ...overrides,
  }
}

function current(overrides: Partial<Parameters<typeof buildBrandSuggestions>[1]> = {}) {
  return {
    client: { niche: '', language: 'English' },
    brand: {
      targetAudience: '',
      tone: '',
      avoidTopics: '',
      languageFormality: 'neutral',
      contentPillars: [],
    },
    ...overrides,
  }
}

describe('buildBrandSuggestions', () => {
  it('proposes every field the read filled', () => {
    const ids = buildBrandSuggestions(analysis(), current()).map((s) => s.id)
    expect(ids).toEqual(['niche', 'audience', 'tone', 'language', 'avoid', 'pillars'])
  })

  it('never proposes the business name or the health flag', () => {
    const suggestions = buildBrandSuggestions(analysis(), current())
    expect(suggestions.some((s) => s.suggested === 'Acme Studio')).toBe(false)
    // A row that could flip the flag would carry it in its patch; none may.
    expect(suggestions.some((s) => 'isHealthNiche' in (s.patch.brand ?? {}))).toBe(false)
  })

  it('omits a field the read could not fill', () => {
    const suggestions = buildBrandSuggestions(
      analysis({ detected_tone: '', detected_avoid_topics: null, detected_target_audience: [] }),
      current()
    )
    expect(suggestions.map((s) => s.id)).toEqual(['niche', 'language', 'pillars'])
  })

  it('omits a field the client already agrees with', () => {
    const suggestions = buildBrandSuggestions(
      analysis(),
      current({ client: { niche: 'Dental clinic', language: 'English' } })
    )
    expect(suggestions.some((s) => s.id === 'niche')).toBe(false)
  })

  it('treats case and spacing as agreement, not as a change to review', () => {
    const suggestions = buildBrandSuggestions(
      analysis(),
      current({ client: { niche: '  dental   CLINIC ', language: 'English' } })
    )
    expect(suggestions.some((s) => s.id === 'niche')).toBe(false)
  })

  it('keeps the id of a pillar that survives under the same name', () => {
    const kept = { id: 'pillar-uuid-1', pillar: 'Patient stories', weight: 25 }
    const suggestions = buildBrandSuggestions(
      analysis(),
      current({
        client: { niche: '', language: 'English' },
        brand: {
          targetAudience: '',
          tone: '',
          avoidTopics: '',
          languageFormality: 'neutral',
          contentPillars: [kept],
        },
      })
    )
    const pillars = suggestions.find((s) => s.id === 'pillars')!.patch.brand!.contentPillars!
    // Same id — every source pointing at this pillar keeps pointing at it.
    expect(pillars[0]).toEqual({ id: 'pillar-uuid-1', pillar: 'Patient stories', weight: 60 })
    // The pillar that has no namesake gets a fresh one rather than none.
    expect(pillars[1]!.id).toBeTruthy()
    expect(pillars[1]!.id).not.toBe('pillar-uuid-1')
  })

  it('pairs formality with the language it was measured in', () => {
    const language = buildBrandSuggestions(analysis(), current()).find((s) => s.id === 'language')!
    expect(language.current).toBe('English · neutral')
    expect(language.suggested).toBe('Bulgarian · formal')
    expect(language.patch).toEqual({
      client: { language: 'Bulgarian' },
      brand: { languageFormality: 'formal' },
    })
  })

  it('falls back to neutral formality rather than writing an empty register', () => {
    const suggestions = buildBrandSuggestions(
      analysis({ detected_language_formality: '' }),
      current()
    )
    expect(suggestions.find((s) => s.id === 'language')!.patch.brand).toEqual({
      languageFormality: 'neutral',
    })
  })

  it('describes each side of the pillar row so the split can be read without expanding it', () => {
    const pillars = buildBrandSuggestions(analysis(), current()).find((s) => s.id === 'pillars')!
    expect(pillars.current).toBe('')
    expect(pillars.suggested).toBe('Patient stories 60% · Treatments explained 40%')
  })

  it('carries both pillar sets structurally, so the row can be rendered as a mix', () => {
    const pillars = buildBrandSuggestions(analysis(), current()).find((s) => s.id === 'pillars')!
    expect(pillars.parts?.current).toEqual([])
    expect(pillars.parts?.suggested.map((p) => [p.pillar, p.weight])).toEqual([
      ['Patient stories', 60],
      ['Treatments explained', 40],
    ])
  })

  it('warns on the pillar row when a scoped source would lose every pillar it points at', () => {
    const suggestions = buildBrandSuggestions(analysis(), current(), [['old-1'], ['old-2']])
    expect(suggestions.find((s) => s.id === 'pillars')!.warning).toBe(
      '2 sources scoped to the pillars this replaces will go back to feeding every pillar.'
    )
  })

  it('stays quiet when a surviving pillar keeps the source scoped', () => {
    const kept = { id: 'pillar-uuid-1', pillar: 'Patient stories', weight: 25 }
    const suggestions = buildBrandSuggestions(
      analysis(),
      current({
        client: { niche: '', language: 'English' },
        brand: {
          targetAudience: '',
          tone: '',
          avoidTopics: '',
          languageFormality: 'neutral',
          contentPillars: [kept],
        },
      }),
      // Scoped to the pillar that survives the read by name, so its id survives with it.
      [['pillar-uuid-1']]
    )
    expect(suggestions.find((s) => s.id === 'pillars')!.warning).toBeUndefined()
  })

  it('leaves the sentence rows without parts, so they stay prose', () => {
    const tone = buildBrandSuggestions(analysis(), current()).find((s) => s.id === 'tone')!
    expect(tone.parts).toBeUndefined()
  })
})

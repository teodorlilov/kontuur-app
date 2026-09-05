import { describe, expect, it } from 'vitest'
import { buildDraftFromAnalysis, buildEmptyDraft, paletteProvenance } from '../build-draft'
import type { UrlAnalysisResponse } from '@/types/api'

function analysis(overrides: Partial<UrlAnalysisResponse> = {}): UrlAnalysisResponse {
  return {
    detected_business_name: 'Недвижими имоти Витоша',
    detected_niche: 'Real estate agency',
    detected_niche_confidence: 'high',
    detected_target_audience: ['Property buyers', 'Property sellers'],
    detected_tone: 'Professional and attentive.',
    detected_content_pillars: [
      { pillar: 'Property listings', weight: 40 },
      { pillar: 'Expert team', weight: 60 },
    ],
    detected_services_products: [],
    detected_language: 'Bulgarian',
    detected_language_formality: 'formal',
    detected_is_health_niche: false,
    detected_avoid_topics: 'Political content',
    ...overrides,
  }
}

describe('buildDraftFromAnalysis', () => {
  it('drafts every field the analysis answers', () => {
    const { draft } = buildDraftFromAnalysis(analysis())

    expect(draft.name).toBe('Недвижими имоти Витоша')
    expect(draft.niche).toBe('Real estate agency')
    expect(draft.audience).toBe('Property buyers, Property sellers')
    expect(draft.tone).toBe('Professional and attentive.')
    expect(draft.language).toBe('Bulgarian')
    expect(draft.languageFormality).toBe('formal')
    expect(draft.avoid).toBe('Political content')
    expect(draft.pillars.map((p) => p.pillar)).toEqual(['Property listings', 'Expert team'])
  })

  it('stamps pillar ids, because the editor keys its rows by id', () => {
    const { draft } = buildDraftFromAnalysis(analysis())
    expect(draft.pillars.every((p) => p.id.length > 0)).toBe(true)
    expect(new Set(draft.pillars.map((p) => p.id)).size).toBe(draft.pillars.length)
  })

  it('always asks the question no website can answer', () => {
    // It was two. The other was which account to publish to, and the sheet stored the
    // answer as the client's one network — a question the product no longer asks anyone,
    // because destinations are picked per post when it is scheduled.
    const { draft, unanswered, provenance } = buildDraftFromAnalysis(analysis())
    expect(draft.goal).toBe('')
    expect(unanswered).toEqual(expect.arrayContaining(['goal']))
    expect(provenance.goal).toBeUndefined()
  })

  it('carries the health-niche flag even though it has no row', () => {
    const { draft } = buildDraftFromAnalysis(analysis({ detected_is_health_niche: true }))
    expect(draft.isHealthNiche).toBe(true)
  })

  it('passes the niche confidence through to the chip', () => {
    const { provenance } = buildDraftFromAnalysis(analysis({ detected_niche_confidence: 'low' }))
    expect(provenance.niche).toEqual({ source: 'their services page', confidence: 'low' })
  })

  it('reports a field as unanswered rather than drafting an empty value', () => {
    const { draft, provenance, unanswered } = buildDraftFromAnalysis(
      analysis({
        detected_business_name: null,
        detected_avoid_topics: null,
        detected_target_audience: [],
        detected_content_pillars: [],
      })
    )

    expect(draft.name).toBe('')
    expect(provenance.name).toBeUndefined()
    expect(unanswered).toEqual(expect.arrayContaining(['name', 'audience', 'avoid', 'mix', 'goal']))
  })

  it('leaves the palette to the separate extraction, not the page read', () => {
    const { draft, provenance } = buildDraftFromAnalysis(analysis())
    expect(draft.identity).toEqual(buildEmptyDraft().identity)
    expect(provenance.palette).toBeUndefined()
  })

  it('defaults the cadence and says so, rather than claiming the site set it', () => {
    const { draft, provenance } = buildDraftFromAnalysis(analysis())
    expect(draft.schedule).toEqual({ day: 'monday', time: '09:00', count: '3' })
    expect(provenance.schedule?.source).toBe('a starting cadence')
    expect(provenance.schedule?.confidence).toBe('low')
  })
})

describe('paletteProvenance', () => {
  it('claims nothing while the colour read is still running', () => {
    // The draft is carrying DEFAULT_PALETTE at this point. A chip here would attribute a blue
    // accent to a client whose site has not been measured yet.
    expect(paletteProvenance('pending')).toBeUndefined()
  })

  it('credits the site only once colours were actually measured', () => {
    expect(paletteProvenance('ready')).toEqual({
      source: "the site's own colours",
      confidence: 'high',
    })
  })

  it('says so when the colours are defaults, and flags them for a second look', () => {
    for (const status of ['idle', 'failed', 'fallback'] as const) {
      expect(paletteProvenance(status)).toEqual({
        source: 'defaults, not read from the site',
        confidence: 'low',
      })
    }
  })
})

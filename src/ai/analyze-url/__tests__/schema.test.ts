import { describe, it, expect } from 'vitest'
import { urlAnalysisResponseSchema } from '../schema'

describe('urlAnalysisResponseSchema', () => {
  it('keeps a well-formed response intact', () => {
    const raw = {
      detected_business_name: 'Haelan',
      detected_niche: 'physiotherapy clinic',
      detected_niche_confidence: 'high',
      detected_target_audience: ['Active adults'],
      detected_tone: 'Warm and expert',
      detected_content_pillars: [{ pillar: 'Recovery tips', weight: 100 }],
      detected_services_products: ['Manual therapy'],
      detected_language: 'Bulgarian',
      detected_language_formality: 'formal',
      detected_is_health_niche: true,
      detected_avoid_topics: 'Politics',
    }
    expect(urlAnalysisResponseSchema.parse(raw)).toEqual(raw)
  })

  it('fills in the arrays the draft builder reads .length on', () => {
    // The regression this schema exists for: the builder dereferences these two directly, so a
    // response missing them threw inside a fire-and-forget handler and the flow silently stalled.
    const parsed = urlAnalysisResponseSchema.parse({})
    expect(parsed.detected_target_audience).toEqual([])
    expect(parsed.detected_content_pillars).toEqual([])
    expect(parsed.detected_services_products).toEqual([])
  })

  it('drops a field of the wrong type instead of rejecting the whole read', () => {
    const parsed = urlAnalysisResponseSchema.parse({
      detected_niche: 'real estate agency',
      detected_target_audience: 'Property buyers',
      detected_content_pillars: [{ pillar: 'Listings' }],
      detected_is_health_niche: 'no',
    })
    expect(parsed.detected_niche).toBe('real estate agency')
    expect(parsed.detected_target_audience).toEqual([])
    expect(parsed.detected_content_pillars).toEqual([])
    expect(parsed.detected_is_health_niche).toBe(false)
  })

  it('falls back to low confidence rather than an unusable value', () => {
    // The confidence tints a chip Amber. Guessing "high" from a value we do not recognise would
    // claim more than the read supports.
    expect(urlAnalysisResponseSchema.parse({ detected_niche_confidence: 'Medium' })
      .detected_niche_confidence).toBe('low')
  })

  it('still rejects a response that is not an object', () => {
    // This is the one case worth failing on: the route logs it and the flow falls back to the
    // blank form rather than opening a sheet that read nothing.
    expect(() => urlAnalysisResponseSchema.parse([])).toThrow()
    expect(() => urlAnalysisResponseSchema.parse(null)).toThrow()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/ai-client')

import { mockClaudeResponse, callAnthropic } from '@/utils/__mocks__/ai-client'
import { validateQuality } from '../validate-quality'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { LanguageConfig } from '@/lib/clients/language-rules'

beforeEach(() => {
  vi.clearAllMocks()
})

const DEFAULT_LANGUAGE_CONFIG: LanguageConfig = {
  language: 'English',
  formality: 'neutral',
  carouselSwipeCues: '',
  formalityRules: null,
  languageInstructions: '',
  languageNotes: '',
}

/** Helper: build a minimal ClientData for tests. */
function makeClientData(overrides: Partial<ClientData> = {}): ClientData {
  return {
    id: 'test-id',
    name: 'Test Client',
    niche: 'wellness',
    language: 'English',
    tone: 'professional',
    targetAudience: 'adults',
    avoidTopics: '',
    clientTestimonialVoice: '',
    contentPillars: [],
    isHealthNiche: null,
    topPerformingPosts: [],
    defaultCarouselSlides: 5,
    defaultPostType: null,
    requireSourceGrounding: false,
    sourceStrategy: null,
    languageNotes: '',
    languageConfig: DEFAULT_LANGUAGE_CONFIG,
    postHistory: [],
    ...overrides,
  }
}

/** Helper: build a valid LLM response with sensible defaults. */
function llmResponse(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    ai_tells: [],
    worst_offending_phrase: null,
    issues: [],
    hook_verdict: 'clear_value',
    cta_verdict: 'clear_relevant',
    brand_voice_match: true,
    brand_voice_deviation: null,
    audience_targeting: true,
    audience_gap: null,
    niche_specificity: true,
    niche_gap: null,
    ...overrides,
  })
}

describe('validateQuality — single post', () => {
  it('returns parsed quality scores with kind: single', async () => {
    mockClaudeResponse(llmResponse())
    const result = await validateQuality({ caption: 'Check out our latest product!' })
    expect(result.kind).toBe('single')
    // 0 ai_tells, all brand checks pass → human_score = 10
    expect(result.human_score).toBe(10)
    // hook_verdict 'clear_value' → 8
    expect(result.hook_score).toBe(8)
    // cta_verdict 'clear_relevant' → 8
    expect(result.cta_score).toBe(8)
    expect(result.ai_tells).toEqual([])
    expect(result.issues).toEqual([])
  })

  it('returns ai_tells and worst_offending_phrase', async () => {
    mockClaudeResponse(
      llmResponse({
        ai_tells: ['Generic enthusiasm', 'Formulaic structure'],
        worst_offending_phrase: "In today's fast-paced world",
        issues: [{ type: 'weak_hook', description: 'Opening lacks specificity' }],
        hook_verdict: 'generic',
        cta_verdict: 'generic',
      })
    )
    const result = await validateQuality({ caption: 'This is a generic post' })
    expect(result.ai_tells).toHaveLength(2)
    expect(result.worst_offending_phrase).toBe("In today's fast-paced world")
    expect(result.issues).toHaveLength(1)
    // 2 ai_tells (-2) → human_score = 8
    expect(result.human_score).toBe(8)
    // hook_verdict 'generic' (5) - weak_hook penalty (1) = 4
    expect(result.hook_score).toBe(4)
    // cta_verdict 'generic' → 5
    expect(result.cta_score).toBe(5)
  })

  it('handles JSON wrapped in markdown code block', async () => {
    const json = llmResponse({ hook_verdict: 'stops_scroll', cta_verdict: 'natural_specific' })
    mockClaudeResponse(`\`\`\`json\n${json}\n\`\`\``)
    const result = await validateQuality({ caption: 'Great post' })
    // 0 ai_tells → human_score = 10
    expect(result.human_score).toBe(10)
    // stops_scroll → 10
    expect(result.hook_score).toBe(10)
  })

  it('includes verdict and brand check instructions in system prompt', async () => {
    mockClaudeResponse(llmResponse())
    await validateQuality({ caption: 'Test' })

    const callArgs = callAnthropic.mock.calls[0]![0]
    const systemText = callArgs.systemPrompt as string
    expect(systemText).toContain('HOOK VERDICT')
    expect(systemText).toContain('CTA VERDICT')
    expect(systemText).toContain('BRAND CHECKS')
    expect(systemText).toContain('brand_voice_match')
  })

  it('includes brand context when ClientData provided', async () => {
    mockClaudeResponse(llmResponse())
    await validateQuality(
      { caption: 'Test' },
      makeClientData({ tone: 'casual', niche: 'fitness', targetAudience: 'gym-goers' })
    )

    const callArgs = callAnthropic.mock.calls[0]![0]
    const systemText = callArgs.systemPrompt as string
    expect(systemText).toContain('BRAND CONTEXT')
    expect(systemText).toContain('fitness')
    expect(systemText).toContain('gym-goers')
  })

  it('includes criteria checklist in system prompt', async () => {
    mockClaudeResponse(llmResponse())
    await validateQuality(
      { caption: 'Test' },
      makeClientData({
        languageConfig: {
          language: 'Bulgarian',
          formality: 'formal',
          carouselSwipeCues: '',
          formalityRules: null,
          languageInstructions: '',
          languageNotes: '',
        },
      }),
      { platform: 'Instagram' }
    )

    const callArgs = callAnthropic.mock.calls[0]![0]
    const systemText = callArgs.systemPrompt as string
    expect(systemText).toContain('GENERATION CRITERIA')
    expect(systemText).toContain('OPENER')
    expect(systemText).toContain('WORD COUNT')
    expect(systemText).toContain('LANGUAGE REGISTER: Use formal register consistently.')
  })

  it('includes new detection fields in return format', async () => {
    mockClaudeResponse(
      llmResponse({
        structure_used: 'OBSERVATION',
        formality_consistent: true,
      })
    )
    const result = await validateQuality({ caption: 'Test' })
    expect(result.structure_used).toBe('OBSERVATION')
    expect(result.formality_consistent).toBe(true)
  })

  it('includes language-specific AI tells when ClientData provided', async () => {
    mockClaudeResponse(llmResponse())
    await validateQuality(
      { caption: 'Тест пост' },
      makeClientData({
        languageConfig: {
          language: 'Bulgarian',
          formality: 'neutral',
          carouselSwipeCues: '',
          formalityRules: null,
          languageInstructions: '',
          languageNotes: '',
        },
      })
    )

    const callArgs = callAnthropic.mock.calls[0]![0]
    const systemText = callArgs.systemPrompt as string
    expect(systemText).toContain('Bulgarian')
    // Bulgarian-specific AI tell from hardcoded BG_SPECIFIC_AI_TELLS
    expect(systemText).toContain('има за цел да')
  })
})

describe('validateQuality — carousel', () => {
  it('returns carousel quality with kind: carousel', async () => {
    mockClaudeResponse(
      llmResponse({
        ai_tells: ['Generic enthusiasm'],
        hook_verdict: 'clear_value',
        cta_verdict: 'clear_relevant',
      })
    )

    const slides = [
      { headline: 'H1', body: 'B1' },
      { headline: 'H2', body: 'B2' },
      { headline: 'H3', body: 'B3' },
    ]
    const result = await validateQuality({ caption: 'My carousel', slides })
    expect(result.kind).toBe('carousel')
    // 1 ai_tell (-1) → human_score = 9
    expect(result.human_score).toBe(9)
    // clear_value → 8
    expect(result.hook_score).toBe(8)
    expect(result.ai_tells).toEqual(['Generic enthusiasm'])
  })

  it('includes slide content in carousel prompt', async () => {
    mockClaudeResponse(llmResponse())
    await validateQuality({ caption: 'Caption', slides: [{ headline: 'H', body: 'B' }] })

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('slides_to_rate')
    expect(prompt).toContain('Headline: H')
    expect(prompt).toContain('Body: B')
    expect(prompt).not.toContain('PER-SLIDE EVALUATION')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/ai-client')

import { callAnthropic, mockClaudeResponse } from '@/utils/__mocks__/ai-client'
import { rewriteCaption, rewriteCarousel } from '../rewrite-prompts'
import type { ClientContext } from '@/lib/clients/fetch-client-data'

beforeEach(() => {
  vi.clearAllMocks()
})

function makeClient(overrides: Partial<ClientContext> = {}): ClientContext {
  return {
    id: 'test-client-id',
    name: 'Test Client',
    niche: 'Skincare',
    tone: 'professional',
    targetAudience: 'Women 25-45',
    clientTestimonialVoice: 'They really care about my skin.',
    avoidTopics: 'politics',
    contentPillars: [{ pillar: 'Skincare tips', weight: 50 }, { pillar: 'Product reviews', weight: 50 }],
    isHealthNiche: null,
    postHistory: ['hydration tips', 'sunscreen myths'],
    languageConfig: {
      language: 'Bulgarian',
      formality: 'neutral',
      carouselSwipeCues: '',
      formalityRules: null,
      languageInstructions: '',
      languageNotes: '',
    },
    ...overrides,
  }
}

describe('rewriteCaption', () => {
  it('returns rewritten text from Claude response', async () => {
    mockClaudeResponse('Ето как 30 минути разходка след хранене променят кръвната ви захар.')
    const result = await rewriteCaption({
      caption: 'Открийте силата на разходката за контрол на кръвната захар.',
      aiTells: ['Generic enthusiasm', 'Formulaic structure'],
      client: makeClient(),
      platform: 'instagram',
    })
    expect(result).toBe('Ето как 30 минути разходка след хранене променят кръвната ви захар.')
  })

  it('returns original caption when Claude returns non-text response', async () => {
    callAnthropic.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }],
    })
    const original = 'Original caption text.'
    const result = await rewriteCaption({
      caption: original,
      aiTells: ['Generic opener'],
      client: makeClient(),
      platform: 'instagram',
    })
    expect(result).toBe(original)
  })

  it('includes AI tells in the prompt', async () => {
    mockClaudeResponse('Rewritten text')
    await rewriteCaption({
      caption: 'Test post',
      aiTells: ['Triple adjective stacking', 'Formulaic CTA'],
      client: makeClient(),
      platform: 'instagram',
    })

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('Triple adjective stacking')
    expect(prompt).toContain('Formulaic CTA')
  })

  it('includes language and formality in the prompt', async () => {
    mockClaudeResponse('Rewritten text')
    await rewriteCaption({
      caption: 'Test post',
      aiTells: [],
      client: makeClient({
        tone: 'casual',
        languageConfig: {
          language: 'Spanish',
          formality: 'formal',
          carouselSwipeCues: '',
          formalityRules: null,
          languageInstructions: '',
          languageNotes: '',
        },
      }),
      platform: 'instagram',
    })

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('Spanish')
    expect(prompt).toContain('formal')
    expect(prompt).toContain('casual')
  })

  it('trims whitespace from Claude response', async () => {
    mockClaudeResponse('  Rewritten text with spaces  \n\n')
    const result = await rewriteCaption({
      caption: 'Original',
      aiTells: [],
      client: makeClient(),
      platform: 'instagram',
    })
    expect(result).toBe('Rewritten text with spaces')
  })
})

describe('rewriteCarousel', () => {
  // Response without leading '{' — the code prepends it via assistant prefill
  const CAROUSEL_RESPONSE_BODY = '"main_caption": "Rewritten carousel caption", "slides": [{"headline": "New H1", "body": "New B1"}, {"headline": "New H2", "body": "New B2"}]}'

  it('returns parsed carousel result', async () => {
    mockClaudeResponse(CAROUSEL_RESPONSE_BODY)
    const result = await rewriteCarousel({
      mainCaption: 'Original caption',
      slides: [
        { headline: 'H1', body: 'B1' },
        { headline: 'H2', body: 'B2' },
      ],
      aiTells: ['Generic headlines'],
      client: makeClient(),
      platform: 'instagram',
    })
    expect(result.main_caption).toBe('Rewritten carousel caption')
    expect(result.slides).toHaveLength(2)
    expect(result.slides[0]!.headline).toBe('New H1')
    expect(result.slides[1]!.body).toBe('New B2')
  })

  it('handles JSON wrapped in markdown code block', async () => {
    mockClaudeResponse('```json\n' + CAROUSEL_RESPONSE_BODY + '\n```')
    const result = await rewriteCarousel({
      mainCaption: 'Caption',
      slides: [{ headline: 'H1', body: 'B1' }],
      aiTells: [],
      client: makeClient(),
      platform: 'instagram',
    })
    expect(result.main_caption).toBe('Rewritten carousel caption')
  })

  it('includes slide content in the prompt', async () => {
    mockClaudeResponse(CAROUSEL_RESPONSE_BODY)
    await rewriteCarousel({
      mainCaption: 'Caption',
      slides: [
        { headline: 'Slide One Title', body: 'Slide one body text' },
        { headline: 'Slide Two Title', body: 'Slide two body text' },
      ],
      aiTells: [],
      client: makeClient(),
      platform: 'instagram',
    })

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('Slide One Title')
    expect(prompt).toContain('Slide two body text')
    expect(prompt).toContain('Slide 1:')
    expect(prompt).toContain('Slide 2:')
  })

  it('includes AI tells in carousel prompt', async () => {
    mockClaudeResponse(CAROUSEL_RESPONSE_BODY)
    await rewriteCarousel({
      mainCaption: 'Caption',
      slides: [{ headline: 'H', body: 'B' }],
      aiTells: ['Perfectly balanced structure', 'Abstract benefits'],
      client: makeClient(),
      platform: 'instagram',
    })

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('Perfectly balanced structure')
    expect(prompt).toContain('Abstract benefits')
  })
})

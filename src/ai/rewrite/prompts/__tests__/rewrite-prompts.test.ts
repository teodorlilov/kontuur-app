import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/ai/client')

import { anthropic, mockClaudeResponse } from '@/ai/__mocks__/client'
import { rewriteCaption, rewriteCarousel } from '../rewrite-prompts'

beforeEach(() => {
  vi.clearAllMocks()
})

const BASE_INPUT = {
  clientName: 'Test Client',
  language: 'Bulgarian',
  formality: 'neutral',
  tone: 'professional',
  platform: 'instagram',
  bannedAnglicisms: ['тренд'],
  bannedCalques: ['направи разлика'],
  niche: 'Skincare',
  targetAudience: 'Women 25-45',
  clientTestimonialVoice: 'They really care about my skin.',
  contentPillars: [{ pillar: 'Skincare tips', weight: 50 }, { pillar: 'Product reviews', weight: 50 }],
  avoidTopics: 'politics',
  postHistory: ['hydration tips', 'sunscreen myths'],
  isHealthClient: null,
}

describe('rewriteCaption', () => {
  it('returns rewritten text from Claude response', async () => {
    mockClaudeResponse('Ето как 30 минути разходка след хранене променят кръвната ви захар.')
    const result = await rewriteCaption({
      caption: 'Открийте силата на разходката за контрол на кръвната захар.',
      aiTells: ['Generic enthusiasm', 'Formulaic structure'],
      ...BASE_INPUT,
    })
    expect(result).toBe('Ето как 30 минути разходка след хранене променят кръвната ви захар.')
  })

  it('returns original caption when Claude returns non-text response', async () => {
    anthropic.messages.create.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }],
    })
    const original = 'Original caption text.'
    const result = await rewriteCaption({
      caption: original,
      aiTells: ['Generic opener'],
      ...BASE_INPUT,
    })
    expect(result).toBe(original)
  })

  it('includes AI tells in the prompt', async () => {
    mockClaudeResponse('Rewritten text')
    await rewriteCaption({
      caption: 'Test post',
      aiTells: ['Triple adjective stacking', 'Formulaic CTA'],
      ...BASE_INPUT,
    })

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).toContain('Triple adjective stacking')
    expect(prompt).toContain('Formulaic CTA')
  })

  it('includes language and formality in the prompt', async () => {
    mockClaudeResponse('Rewritten text')
    await rewriteCaption({
      ...BASE_INPUT,
      caption: 'Test post',
      aiTells: [],
      language: 'Spanish',
      formality: 'formal',
      tone: 'casual',
      bannedAnglicisms: [],
      bannedCalques: [],
    })

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).toContain('Spanish')
    expect(prompt).toContain('formal')
    expect(prompt).toContain('casual')
  })

  it('includes banned anglicisms and calques in the prompt', async () => {
    mockClaudeResponse('Rewritten text')
    await rewriteCaption({
      caption: 'Test post',
      aiTells: [],
      ...BASE_INPUT,
    })

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).toContain('тренд')
    expect(prompt).toContain('направи разлика')
  })

  it('trims whitespace from Claude response', async () => {
    mockClaudeResponse('  Rewritten text with spaces  \n\n')
    const result = await rewriteCaption({
      caption: 'Original',
      aiTells: [],
      ...BASE_INPUT,
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
      ...BASE_INPUT,
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
      ...BASE_INPUT,
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
      ...BASE_INPUT,
    })

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
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
      ...BASE_INPUT,
    })

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).toContain('Perfectly balanced structure')
    expect(prompt).toContain('Abstract benefits')
  })
})

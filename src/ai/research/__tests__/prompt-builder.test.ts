import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/ai-client')

import { callAnthropic, mockClaudeResponse } from '@/utils/__mocks__/ai-client'
import { ResearchPromptBuilder } from '../prompt-builder'
import type { SourceContext } from '../types'

beforeEach(() => {
  vi.clearAllMocks()
})

// Claude's response body after the '[' assistantPrefill — excludes the leading '[' character
const VALID_RESPONSE = JSON.stringify([
  { finding: 'Article about HIIT workouts', suggested_theme: 'Share latest HIIT research' },
  { finding: 'Trending meal prep videos', suggested_theme: 'Weekly meal prep guide' },
  { finding: 'Mental health awareness', suggested_theme: 'Mindfulness for athletes' },
  { finding: 'Recovery techniques post', suggested_theme: 'Post-workout recovery tips' },
  { finding: 'New supplement study', suggested_theme: 'Science-backed supplements' },
]).slice(1)

import type { LanguageConfig } from '@/lib/clients/language-rules'

function makeLanguageConfig(language = 'English'): LanguageConfig {
  return {
    language,
    formality: 'neutral',
    carouselSwipeCues: '',
    formalityRules: null,
    languageInstructions: '',
    languageNotes: '',
  }
}

function createBuilder(
  overrides?: Partial<{
    niche: string
    languageConfig: LanguageConfig
    contentPillars: { pillar: string; weight: number }[]
    postHistory: string[]
  }>
) {
  return new ResearchPromptBuilder({
    niche: 'fitness',
    languageConfig: makeLanguageConfig(),
    contentPillars: [],
    postHistory: [],
    ...overrides,
  })
}

describe('ResearchPromptBuilder', () => {
  it('returns parsed research topics from Claude response', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder()
    const { topics } = await builder.generateTopics(5)
    expect(topics).toHaveLength(5)
    expect(topics[0]!.finding).toBe('Article about HIIT workouts')
    expect(topics[0]!.suggested_theme).toBe('Share latest HIIT research')
  })

  it('uses source-grounded prompt when sourceContext has RSS items', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const sourceContext: SourceContext = {
      rssItems: [
        {
          title: 'HIIT Benefits',
          description: 'New study on HIIT',
          link: 'https://x.com/1',
          pubDate: null,
        },
      ],
      websiteExcerpts: [],
      fileExcerpts: [],
    }
    const builder = createBuilder()
    await builder.generateTopics(5, sourceContext)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('HIIT Benefits')
    expect(prompt).toContain('https://x.com/1')
    expect(prompt).toContain('SOURCING PROTOCOL')
    expect(prompt).not.toContain('RESEARCH BRIEF')
  })

  it('uses source-grounded prompt when sourceContext has website excerpts', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const sourceContext: SourceContext = {
      rssItems: [],
      websiteExcerpts: [
        {
          url: 'https://example.com',
          text: '## Our Services\n\nPersonal training and group classes.',
        },
      ],
      fileExcerpts: [],
    }
    const builder = createBuilder()
    await builder.generateTopics(5, sourceContext)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('Our Services')
    expect(prompt).toContain('website_content')
  })

  it('uses source-grounded prompt when sourceContext has file excerpts', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const sourceContext: SourceContext = {
      rssItems: [],
      websiteExcerpts: [],
      fileExcerpts: [
        {
          label: 'Services',
          text: 'We offer Botox, dermal fillers, and chemical peels for facial rejuvenation.',
        },
      ],
    }
    const builder = createBuilder()
    await builder.generateTopics(5, sourceContext)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('Botox')
    expect(prompt).toContain('document_content')
  })

  it('uses trend-based fallback when no sourceContext', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder()
    await builder.generateTopics(5)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('RESEARCH BRIEF')
    expect(prompt).not.toContain('SOURCING PROTOCOL')
  })

  it('uses trend-based fallback when sourceContext is empty', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder()
    await builder.generateTopics(5, { rssItems: [], websiteExcerpts: [], fileExcerpts: [] })

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('RESEARCH BRIEF')
  })

  it('includes content pillars in prompt when provided', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder({
      contentPillars: [
        { pillar: 'Nutrition', weight: 40 },
        { pillar: 'Workouts', weight: 35 },
        { pillar: 'Recovery', weight: 25 },
      ],
    })
    await builder.generateTopics(5)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('Nutrition')
    expect(prompt).toContain('Workouts')
    expect(prompt).toContain('Recovery')
  })

  it('includes language in prompt', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder({ languageConfig: makeLanguageConfig('Bulgarian') })
    await builder.generateTopics(5)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('Bulgarian')
  })

  it('handles JSON wrapped in markdown code block', async () => {
    mockClaudeResponse('```json\n' + VALID_RESPONSE + '\n```')
    const builder = createBuilder()
    const { topics } = await builder.generateTopics(5)
    expect(topics).toHaveLength(5)
  })

  it('returns empty array when Claude returns no JSON', async () => {
    mockClaudeResponse('I could not find any trends.')
    const builder = createBuilder()
    const { topics } = await builder.generateTopics(5)
    expect(topics).toEqual([])
  })

  it('uses custom count in fallback prompt', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder()
    await builder.generateTopics(3)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('Identify exactly 3')
    expect(prompt).not.toContain('Identify exactly 5')
  })

  it('uses custom count in source-grounded prompt', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const sourceContext: SourceContext = {
      rssItems: [{ title: 'Article', description: 'Desc', link: 'https://x.com/1', pubDate: null }],
      websiteExcerpts: [],
      fileExcerpts: [],
    }
    const builder = createBuilder()
    await builder.generateTopics(7, sourceContext)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('Identify exactly 7')
    expect(prompt).toContain('Generate exactly 7')
  })

  it('defaults count works correctly', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder()
    await builder.generateTopics(5)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('Generate exactly 5')
  })

  it('includes post history in prompt when provided', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder({ postHistory: ['HIIT benefits', 'Protein myths'] })
    await builder.generateTopics(5)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('RECENTLY COVERED TOPICS')
    expect(prompt).toContain('HIIT benefits')
    expect(prompt).toContain('Protein myths')
  })

  it('includes sourcing protocol in source-grounded prompt', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const sourceContext: SourceContext = {
      rssItems: [{ title: 'Article', description: 'Desc', link: 'https://x.com/1', pubDate: null }],
      websiteExcerpts: [],
      fileExcerpts: [],
    }
    const builder = createBuilder({
      contentPillars: [
        { pillar: 'Nutrition', weight: 50 },
        { pillar: 'Investment Tips', weight: 50 },
      ],
    })
    await builder.generateTopics(5, sourceContext)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('SOURCING PROTOCOL')
    expect(prompt).toContain('fitness')
  })

  it('does not include sourcing protocol in trend-based fallback', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder()
    await builder.generateTopics(5)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).not.toContain('SOURCING PROTOCOL')
    expect(prompt).toContain('RESEARCH BRIEF')
  })

  it('uses assistantPrefill [ for JSON array responses', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder()
    await builder.generateTopics(5)

    const callArgs = callAnthropic.mock.calls[0]![0]
    expect(callArgs.assistantPrefill).toBe('[')
  })

  it('returns userPrompt and rawResponse alongside topics', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder()
    const result = await builder.generateTopics(5)
    expect(result.userPrompt).toBeTruthy()
    expect(result.rawResponse).toBeTruthy()
    expect(result.topics).toHaveLength(5)
  })
})

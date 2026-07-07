import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/ai-client')

import {
  callAnthropic,
  mockClaudeResponse,
  mockClaudeToolResponse,
} from '@/utils/__mocks__/ai-client'
import { ResearchPromptBuilder } from '../prompts/prompt-builder'
import { generateTopics } from '../generators/topic-generator'
import type { SourceContext } from '../types'

beforeEach(() => {
  vi.clearAllMocks()
})

// Structured tool_use output matching TOPICS_OUTPUT_SCHEMA in topic-generator
const VALID_TOPICS = [
  { finding: 'Article about HIIT workouts', suggested_theme: 'Share latest HIIT research' },
  { finding: 'Trending meal prep videos', suggested_theme: 'Weekly meal prep guide' },
  { finding: 'Mental health awareness', suggested_theme: 'Mindfulness for athletes' },
  { finding: 'Recovery techniques post', suggested_theme: 'Post-workout recovery tips' },
  { finding: 'New supplement study', suggested_theme: 'Science-backed supplements' },
]

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
    contentPillars: import('@/lib/clients/content-pillars').WeightedPillar[]
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
    mockClaudeToolResponse({ topics: VALID_TOPICS })
    const builder = createBuilder()
    const topics = await generateTopics(builder,5)
    expect(topics).toHaveLength(5)
    expect(topics[0]!.finding).toBe('Article about HIIT workouts')
    expect(topics[0]!.suggested_theme).toBe('Share latest HIIT research')
  })

  it('uses source-grounded prompt when sourceContext has RSS items', async () => {
    mockClaudeToolResponse({ topics: VALID_TOPICS })
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
    await generateTopics(builder,5, sourceContext)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('HIIT Benefits')
    expect(prompt).toContain('https://x.com/1')
    expect(prompt).toContain('SOURCING RULES:')
    expect(prompt).not.toContain('RESEARCH BRIEF')
  })

  it('uses source-grounded prompt when sourceContext has website excerpts', async () => {
    mockClaudeToolResponse({ topics: VALID_TOPICS })
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
    await generateTopics(builder,5, sourceContext)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('Our Services')
    expect(prompt).toContain('website_content')
  })

  it('uses source-grounded prompt when sourceContext has file excerpts', async () => {
    mockClaudeToolResponse({ topics: VALID_TOPICS })
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
    await generateTopics(builder,5, sourceContext)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('Botox')
    expect(prompt).toContain('document_content')
  })

  it('includes content pillars in prompt when provided', async () => {
    mockClaudeToolResponse({ topics: VALID_TOPICS })
    const builder = createBuilder({
      contentPillars: [
        { id: 'p1', pillar: 'Nutrition', weight: 40 },
        { id: 'p2', pillar: 'Workouts', weight: 35 },
        { id: 'p3', pillar: 'Recovery', weight: 25 },
      ],
    })
    await generateTopics(builder,5)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('Nutrition')
    expect(prompt).toContain('Workouts')
    expect(prompt).toContain('Recovery')
  })

  it('includes language in prompt', async () => {
    mockClaudeToolResponse({ topics: VALID_TOPICS })
    const builder = createBuilder({ languageConfig: makeLanguageConfig('Bulgarian') })
    await generateTopics(builder,5)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('Bulgarian')
  })

  it('parses topics returned as a JSON-encoded string (schema coercion)', async () => {
    mockClaudeToolResponse({ topics: JSON.stringify(VALID_TOPICS) })
    const builder = createBuilder()
    const topics = await generateTopics(builder,5)
    expect(topics).toHaveLength(5)
  })

  it('throws when the response has no tool_use block', async () => {
    mockClaudeResponse('I could not find any trends.')
    const builder = createBuilder()
    await expect(generateTopics(builder,5)).rejects.toThrow('No tool_use block')
  })

  it('uses custom count in fallback prompt', async () => {
    mockClaudeToolResponse({ topics: VALID_TOPICS })
    const builder = createBuilder()
    await generateTopics(builder,3)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('Identify up to 3')
    expect(prompt).not.toContain('Identify up to 5')
  })

  it('uses custom count in source-grounded prompt', async () => {
    mockClaudeToolResponse({ topics: VALID_TOPICS })
    const sourceContext: SourceContext = {
      rssItems: [{ title: 'Article', description: 'Desc', link: 'https://x.com/1', pubDate: null }],
      websiteExcerpts: [],
      fileExcerpts: [],
    }
    const builder = createBuilder()
    await generateTopics(builder,7, sourceContext)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('Identify up to 7')
  })

  it('defaults count works correctly', async () => {
    mockClaudeToolResponse({ topics: VALID_TOPICS })
    const builder = createBuilder()
    await generateTopics(builder,5)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('Identify up to 5')
  })

  it('includes post history in prompt when provided', async () => {
    mockClaudeToolResponse({ topics: VALID_TOPICS })
    const builder = createBuilder({ postHistory: ['HIIT benefits', 'Protein myths'] })
    await generateTopics(builder,5)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('RECENTLY COVERED TOPICS')
    expect(prompt).toContain('HIIT benefits')
    expect(prompt).toContain('Protein myths')
  })

  it('includes sourcing protocol in source-grounded prompt', async () => {
    mockClaudeToolResponse({ topics: VALID_TOPICS })
    const sourceContext: SourceContext = {
      rssItems: [{ title: 'Article', description: 'Desc', link: 'https://x.com/1', pubDate: null }],
      websiteExcerpts: [],
      fileExcerpts: [],
    }
    const builder = createBuilder({
      contentPillars: [
        { id: 'p1', pillar: 'Nutrition', weight: 50 },
        { id: 'p2', pillar: 'Investment Tips', weight: 50 },
      ],
    })
    await generateTopics(builder,5, sourceContext)

    const callArgs = callAnthropic.mock.calls[0]![0]
    const prompt = callArgs.userMessage as string
    expect(prompt).toContain('SOURCING RULES:')
    expect(prompt).toContain('fitness')
  })

  it('requests structured output via outputSchema', async () => {
    mockClaudeToolResponse({ topics: VALID_TOPICS })
    const builder = createBuilder()
    await generateTopics(builder,5)

    const callArgs = callAnthropic.mock.calls[0]![0]
    expect(callArgs.outputSchema).toBeDefined()
    expect(callArgs.assistantPrefill).toBeUndefined()
  })

  it('returns parsed topics array', async () => {
    mockClaudeToolResponse({ topics: VALID_TOPICS })
    const builder = createBuilder()
    const topics = await generateTopics(builder,5)
    expect(topics).toHaveLength(5)
  })
})

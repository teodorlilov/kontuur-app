import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/ai/client')

import { anthropic, mockClaudeResponse } from '@/ai/__mocks__/client'
import { ResearchPromptBuilder } from '../prompts/prompt-builder'
import type { SourceContext } from '../types'

beforeEach(() => {
  vi.clearAllMocks()
})

const VALID_RESPONSE = JSON.stringify([
  { finding: 'Article about HIIT workouts', suggested_theme: 'Share latest HIIT research' },
  { finding: 'Trending meal prep videos', suggested_theme: 'Weekly meal prep guide' },
  { finding: 'Mental health awareness', suggested_theme: 'Mindfulness for athletes' },
  { finding: 'Recovery techniques post', suggested_theme: 'Post-workout recovery tips' },
  { finding: 'New supplement study', suggested_theme: 'Science-backed supplements' },
])

function createBuilder(overrides?: Partial<{ niche: string; language: string; contentPillars: { pillar: string; weight: number }[]; postHistory: string[] }>) {
  return new ResearchPromptBuilder({
    niche: 'fitness',
    language: 'English',
    contentPillars: [],
    postHistory: [],
    ...overrides,
  })
}

describe('ResearchPromptBuilder', () => {
  it('returns parsed research topics from Claude response', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder()
    const result = await builder.generateTopics(5)
    expect(result).toHaveLength(5)
    expect(result[0]!.finding).toBe('Article about HIIT workouts')
    expect(result[0]!.suggested_theme).toBe('Share latest HIIT research')
  })

  it('uses source-grounded prompt when sourceContext has RSS items', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const sourceContext: SourceContext = {
      rssItems: [
        { title: 'HIIT Benefits', description: 'New study on HIIT', link: 'https://x.com/1', pubDate: null },
      ],
      websiteExcerpts: [],
      fileExcerpts: [],
    }
    const builder = createBuilder()
    await builder.generateTopics(5, sourceContext)

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).toContain('HIIT Benefits')
    expect(prompt).toContain('https://x.com/1')
    expect(prompt).toContain('Ground each theme')
    expect(prompt).not.toContain('Search for what is trending')
  })

  it('uses source-grounded prompt when sourceContext has website excerpts', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const sourceContext: SourceContext = {
      rssItems: [],
      websiteExcerpts: [{ url: 'https://example.com', text: '## Our Services\n\nPersonal training and group classes.' }],
      fileExcerpts: [],
    }
    const builder = createBuilder()
    await builder.generateTopics(5, sourceContext)

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).toContain('Our Services')
    expect(prompt).toContain('WEBSITE CONTENT')
  })

  it('uses source-grounded prompt when sourceContext has file excerpts', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const sourceContext: SourceContext = {
      rssItems: [],
      websiteExcerpts: [],
      fileExcerpts: [{ label: 'Services', text: 'We offer Botox, dermal fillers, and chemical peels for facial rejuvenation.' }],
    }
    const builder = createBuilder()
    await builder.generateTopics(5, sourceContext)

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).toContain('Botox')
    expect(prompt).toContain('UPLOADED DOCUMENTS')
    expect(prompt).toContain('Ground each theme')
    expect(prompt).not.toContain('Search for what is trending')
  })

  it('uses trend-based fallback when no sourceContext', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder()
    await builder.generateTopics(5)

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).toContain('Search for what is trending')
    expect(prompt).not.toContain('Ground each theme')
  })

  it('uses trend-based fallback when sourceContext is empty', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder()
    await builder.generateTopics(5, { rssItems: [], websiteExcerpts: [], fileExcerpts: [] })

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).toContain('Search for what is trending')
  })

  it('includes content pillars in prompt when provided', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder({
      contentPillars: [{ pillar: 'Nutrition', weight: 40 }, { pillar: 'Workouts', weight: 35 }, { pillar: 'Recovery', weight: 25 }],
    })
    await builder.generateTopics(5)

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).toContain('Nutrition')
    expect(prompt).toContain('Workouts')
    expect(prompt).toContain('Recovery')
  })

  it('includes language in prompt', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder({ language: 'Bulgarian' })
    await builder.generateTopics(5)

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).toContain('Bulgarian')
  })

  it('handles JSON wrapped in markdown code block', async () => {
    mockClaudeResponse('```json\n' + VALID_RESPONSE + '\n```')
    const builder = createBuilder()
    const result = await builder.generateTopics(5)
    expect(result).toHaveLength(5)
  })

  it('returns empty array when Claude returns no JSON', async () => {
    mockClaudeResponse('I could not find any trends.')
    const builder = createBuilder()
    const result = await builder.generateTopics(5)
    expect(result).toEqual([])
  })

  it('uses custom count in fallback prompt', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder()
    await builder.generateTopics(3)

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).toContain('Return exactly 3 findings')
    expect(prompt).not.toContain('Return exactly 5')
  })

  it('uses custom count in source-grounded prompt', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const sourceContext: SourceContext = {
      rssItems: [
        { title: 'Article', description: 'Desc', link: 'https://x.com/1', pubDate: null },
      ],
      websiteExcerpts: [],
      fileExcerpts: [],
    }
    const builder = createBuilder()
    await builder.generateTopics(7, sourceContext)

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).toContain('identify 7 specific post themes for a')
    expect(prompt).toContain('Return exactly 7 findings')
  })

  it('defaults count works correctly', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder()
    await builder.generateTopics(5)

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).toContain('Return exactly 5 findings')
  })

  it('includes post history in prompt when provided', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder({ postHistory: ['HIIT benefits', 'Protein myths'] })
    await builder.generateTopics(5)

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).toContain('RECENTLY COVERED TOPICS')
    expect(prompt).toContain('HIIT benefits')
    expect(prompt).toContain('Protein myths')
  })

  it('includes hybrid sourcing instruction when sourceContext has content', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const sourceContext: SourceContext = {
      rssItems: [
        { title: 'Article', description: 'Desc', link: 'https://x.com/1', pubDate: null },
      ],
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

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).toContain('HYBRID SOURCING')
    expect(prompt).toContain('source_url, source_title, and source_type to null')
    expect(prompt).toContain('fitness')
  })

  it('does not include hybrid sourcing in trend-based fallback', async () => {
    mockClaudeResponse(VALID_RESPONSE)
    const builder = createBuilder()
    await builder.generateTopics(5)

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).not.toContain('HYBRID SOURCING')
    expect(prompt).toContain('Search for what is trending')
  })
})

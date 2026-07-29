import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/ai-client')

import { callAnthropic } from '@/utils/__mocks__/ai-client'
import { generateTopUpTopics } from '../generators/topic-generator'
import { ResearchPromptBuilder } from '../prompts/prompt-builder'
import type { ResearchTopic } from '../types'

beforeEach(() => {
  vi.clearAllMocks()
})

function makeBuilder(): ResearchPromptBuilder {
  return new ResearchPromptBuilder({
    niche: 'physiotherapy',
    languageConfig: {
      language: 'English',
      formality: 'neutral',
      carouselSwipeCues: '',
      formalityRules: null,
      languageInstructions: '',
      languageNotes: '',
    },
    contentPillars: [{ id: 'p1', pillar: 'Educational', weight: 100 }],
    postHistory: [],
    excludedUrls: [],
  })
}

function topic(theme: string, url: string | null): ResearchTopic {
  return {
    finding: 'f',
    suggested_theme: theme,
    pillar: 'Educational',
    source_url: url,
    source_title: 't',
    source_type: url ? 'rss' : null,
    source_excerpt: 'e',
  }
}

describe('generateTopUpTopics', () => {
  it('continues the original conversation and asks for exactly the shortfall', async () => {
    callAnthropic.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          id: 'mock',
          name: 'output',
          input: { topics: [topic('new theme', 'https://a.com/x')] },
        },
      ],
    })

    const result = await generateTopUpTopics(
      makeBuilder(),
      5,
      2,
      undefined,
      [topic('kept', 'https://a.com/1'), topic('rejected', null)],
      ['kept']
    )

    expect(result).toHaveLength(1)
    expect(result[0]!.suggested_theme).toBe('new theme')

    const callOpts = callAnthropic.mock.calls[0]![0] as {
      userMessage: string
      conversationHistory: Array<{ role: string }>
    }
    expect(callOpts.userMessage).toContain('2 of your topics were rejected')
    expect(callOpts.userMessage).toContain('"kept"')
    expect(callOpts.conversationHistory).toHaveLength(2)
    expect(callOpts.conversationHistory[0]!.role).toBe('user')
    expect(callOpts.conversationHistory[1]!.role).toBe('assistant')
  })
})

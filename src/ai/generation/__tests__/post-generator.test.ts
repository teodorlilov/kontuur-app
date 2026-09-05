import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/ai-client')

import { callAnthropic, mockClaudeToolResponse } from '@/utils/__mocks__/ai-client'
import { generatePost } from '../generators/post-generator'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { SinglePostInput } from '../types'

beforeEach(() => {
  vi.clearAllMocks()
})

function makeInput(count = 1): SinglePostInput {
  return {
    client: {
      id: 'client-1',
      name: 'Acme Clinic',
      niche: 'physiotherapy',
      targetAudience: 'active adults',
      tone: 'warm',
      avoidTopics: '',
      socialGoals: '',
      isHealthNiche: false,
      contentPillars: [{ id: 'p1', pillar: 'Educational', weight: 100 }],
      postHistory: [],
      languageConfig: {
        language: 'English',
        formality: 'neutral',
        carouselSwipeCues: '',
        formalityRules: null,
        languageInstructions: '',
        languageNotes: '',
      },
      // Only prompt-relevant fields populated; cast documents the gap
    } as unknown as ClientData,
    theme: 'recovery tips',
    count,
  }
}

describe('generatePost', () => {
  it('is schema-forced and pins the schema to the requested count', async () => {
    mockClaudeToolResponse({ posts: [{ caption: 'one' }, { caption: 'two' }] })
    await generatePost(makeInput(2))

    const call = callAnthropic.mock.calls[0]![0] as {
      outputSchema: { properties: { posts: { minItems: number; maxItems: number } } }
    }
    expect(call.outputSchema.properties.posts.minItems).toBe(2)
    expect(call.outputSchema.properties.posts.maxItems).toBe(2)
  })

  it('strips markdown artifacts from returned captions', async () => {
    // The writer mimics its markdown-formatted source material; a leading "#"
    // reaches the platform verbatim if it survives parsing.
    mockClaudeToolResponse({ posts: [{ caption: '# Заглавие\n**Важно** съдържание.' }] })
    const posts = await generatePost(makeInput())
    expect(posts).toEqual([{ caption: 'Заглавие\nВажно съдържание.' }])
  })

  it('drops captions that are empty after trimming', async () => {
    mockClaudeToolResponse({ posts: [{ caption: '  ' }, { caption: 'real' }] })
    const posts = await generatePost(makeInput(2))
    expect(posts).toEqual([{ caption: 'real' }])
  })
})

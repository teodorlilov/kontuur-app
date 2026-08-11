import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PostValidationResult } from '@/ai/validation/types'
import type { ClientData } from '@/lib/clients/fetch-client-data'

const mocks = vi.hoisted(() => ({
  generatePost: vi.fn(),
  generateCarousel: vi.fn(),
  validatePost: vi.fn(),
  validatePostsBatch: vi.fn(),
}))

vi.mock('@/ai/generation/generators/post-generator', () => ({
  generatePost: mocks.generatePost,
}))
vi.mock('@/ai/generation/generators/carousel-generator', () => ({
  generateCarousel: mocks.generateCarousel,
}))
vi.mock('@/ai/validation/validate-post', () => ({
  validatePost: mocks.validatePost,
  validatePostsBatch: mocks.validatePostsBatch,
}))

import { runGenerationBatch } from '../generation-orchestrator'
import type { EnrichedTheme } from '../types'

function validation(): PostValidationResult {
  return {
    criteria: {
      ai_tells: [],
      worst_offending_phrase: null,
      structure_followed: null,
      source_claims: null,
      health_compliant: null,
      issues: [],
    },
    scores: { overall_score: 8, human_score: 8, language_score: 9, source_score: null },
    language: { passes: true, language_score: 9, issues: [], corrected_text: null },
    slop: {
      reads_as_human: true,
      ai_tells_found: [],
      worst_offending_phrase: null,
      human_authenticity_score: 8,
    },
    qualityScore: 8,
  }
}

function client(): ClientData {
  return {
    id: 'client-1',
    name: 'Acme',
    niche: 'physio',
    language: 'English',
    postHistory: [],
    languageConfig: { language: 'English' },
    // Only the fields this path reads are populated; the cast documents the gap.
  } as unknown as ClientData
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.generatePost.mockResolvedValue([{ caption: 'draft text' }])
  mocks.validatePostsBatch.mockResolvedValue([validation()])
})

describe('per-theme platform', () => {
  it('writes, judges and records each theme on its own platform, falling back to the run', async () => {
    // The load-bearing M19 behaviour: a brief's platform overrides the run's for
    // that one post — writer prompt, judge and draft record all agree — while
    // themes without one (research topics, cron themes) inherit.
    const themes: EnrichedTheme[] = [
      { description: 'the brief', count: 1, platform: 'Facebook' },
      { description: 'researched', count: 1 },
    ]
    const results = await runGenerationBatch({
      client: client(),
      platform: 'Instagram',
      postType: 'single',
      requireSourceGrounding: false,
      themes,
      trackTheme: vi.fn().mockResolvedValue(undefined),
    })

    const platformByTheme = new Map(
      results.map((r) => [r.post.topic_summary, r.post.platform])
    )
    expect(platformByTheme.get('the brief')).toBe('Facebook')
    expect(platformByTheme.get('researched')).toBe('Instagram')

    const writerPlatforms = new Map(
      mocks.generatePost.mock.calls
        .map((c) => c[0] as { platform: string; theme: string })
        .map((input): [string, string] => [input.theme, input.platform])
    )
    expect(writerPlatforms.get('the brief')).toBe('Facebook')
    expect(writerPlatforms.get('researched')).toBe('Instagram')

    const judgePlatforms = new Map(
      mocks.validatePostsBatch.mock.calls
        .map((c) => c[0] as { platform: string; theme: string })
        .map((input): [string, string] => [input.theme, input.platform])
    )
    expect(judgePlatforms.get('the brief')).toBe('Facebook')
    expect(judgePlatforms.get('researched')).toBe('Instagram')
  })
})

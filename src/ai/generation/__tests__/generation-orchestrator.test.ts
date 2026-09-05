import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PostValidationResult } from '@/ai/validation/types'
import type { ClientData } from '@/lib/clients/fetch-client-data'

const mocks = vi.hoisted(() => ({
  generatePost: vi.fn(),
  generateCarousel: vi.fn(),
  revisePost: vi.fn(),
  reviseCarousel: vi.fn(),
  validatePost: vi.fn(),
  validatePostsBatch: vi.fn(),
}))

vi.mock('@/ai/generation/generators/post-generator', () => ({
  generatePost: mocks.generatePost,
  revisePost: mocks.revisePost,
}))
vi.mock('@/ai/generation/generators/carousel-generator', () => ({
  generateCarousel: mocks.generateCarousel,
  reviseCarousel: mocks.reviseCarousel,
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

describe('platform-agnostic generation', () => {
  it('names no network to the writer, the judge or the draft record', async () => {
    // This pinned the opposite: a brief carried its own platform, it overrode the run's,
    // and writer, judge and record all had to agree on which. Copy is written once now and
    // its destinations are chosen when the post is scheduled, so a network reaching any of
    // these three would be a network chosen before anyone could know where the post goes.
    const themes: EnrichedTheme[] = [
      { description: 'the brief', count: 1 },
      { description: 'researched', count: 1 },
    ]
    const results = await runGenerationBatch({
      client: client(),
      postType: 'single',
      themes,
      trackTheme: vi.fn().mockResolvedValue(undefined),
    })

    for (const result of results) expect(result.post).not.toHaveProperty('platform')
    for (const call of mocks.generatePost.mock.calls) {
      expect(call[0]).not.toHaveProperty('platform')
    }
    for (const call of mocks.validatePostsBatch.mock.calls) {
      expect(call[0]).not.toHaveProperty('platform')
    }
  })
})

function run(themes: EnrichedTheme[]) {
  return runGenerationBatch({
    client: client(),
    postType: 'single',
    themes,
    trackTheme: vi.fn().mockResolvedValue(undefined),
  })
}

/** A validation the refine loop must act on: structure failed, no judge fix. */
function structureFailure(): PostValidationResult {
  const v = validation()
  v.criteria.structure_followed = {
    passes: false,
    notes: ['Caption is written as a carousel (slide labels) — this is a single-image post.'],
  }
  v.scores.overall_score = 5
  v.qualityScore = 5
  return v
}

describe('bounded refine loop', () => {
  it('revises on a structure failure and keeps the better result', async () => {
    mocks.validatePostsBatch
      .mockResolvedValueOnce([structureFailure()])
      .mockResolvedValueOnce([validation()])
    mocks.revisePost.mockResolvedValue('revised text')

    const results = await run([{ description: 't', count: 1 }])
    expect(mocks.revisePost).toHaveBeenCalledTimes(1)
    expect(results[0]!.post.caption).toBe('revised text')
    expect(results[0]!.post.quality_score_avg).toBe(8)
  })

  it('never revises a clean draft', async () => {
    await run([{ description: 't', count: 1 }])
    expect(mocks.revisePost).not.toHaveBeenCalled()
  })

  it('flagged issues WITH a judge fix are not a revision trigger — the fix ships instead', async () => {
    const fixed = validation()
    fixed.language.issues = [
      { type: 'anglicism', original_text: 'x', issue_description: 'y', suggested_fix: 'z' },
    ]
    fixed.language.corrected_text = 'corrected by judge'
    mocks.validatePostsBatch.mockResolvedValue([fixed])

    const results = await run([{ description: 't', count: 1 }])
    expect(mocks.revisePost).not.toHaveBeenCalled()
    expect(results[0]!.post.caption).toBe('corrected by judge')
  })

  it('an unjudged revision loses to the judged original', async () => {
    const unjudged = validation()
    unjudged.scores.overall_score = null
    unjudged.qualityScore = null
    mocks.validatePostsBatch
      .mockResolvedValueOnce([structureFailure()])
      .mockResolvedValueOnce([unjudged])
    mocks.revisePost.mockResolvedValue('revised text')

    const results = await run([{ description: 't', count: 1 }])
    expect(results[0]!.post.caption).toBe('draft text')
    expect(results[0]!.post.quality_score_avg).toBe(5)
  })

  it('revisions are capped per run', async () => {
    mocks.validatePostsBatch.mockImplementation(async ({ captions }: { captions: string[] }) =>
      captions.map(() => structureFailure())
    )
    mocks.revisePost.mockResolvedValue('revised text')

    const themes: EnrichedTheme[] = Array.from({ length: 5 }, (_, i) => ({
      description: `t${i}`,
      count: 1,
    }))
    await run(themes)
    expect(mocks.revisePost.mock.calls.length).toBeLessThanOrEqual(3)
  })
})

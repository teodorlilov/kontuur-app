import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/ai-client')

import { callAnthropic } from '@/utils/__mocks__/ai-client'
import { validatePostsBatch } from '../validate-post'
import type { ClientData } from '@/lib/clients/fetch-client-data'

beforeEach(() => {
  vi.clearAllMocks()
})

function makeClient(): ClientData {
  return {
    id: 'client-1',
    name: 'Acme Clinic',
    niche: 'physiotherapy',
    targetAudience: 'active adults 30-50',
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
    // Only fields the validation path reads are populated; cast documents the gap
  } as unknown as ClientData
}

function qualityItem(index: number, overrides: Record<string, unknown> = {}) {
  return {
    index,
    overall_score: 8,
    human_score: 9,
    ai_tells: [],
    worst_offending_phrase: null,
    structure_passes: null,
    structure_notes: [],
    flagged_claims: [],
    corrected_text: null,
    corrected_slides: null,
    health_compliant: null,
    issues: [],
    ...overrides,
  }
}

function languageItem(index: number, overrides: Record<string, unknown> = {}) {
  return { index, issues: [], corrected_text: null, ...overrides }
}

/** Mocks the two batched calls: quality first (has SCORING in system), language second. */
function mockBatchCalls(
  qualityResults: unknown[],
  languageResults: unknown[]
) {
  callAnthropic.mockImplementation((opts: { systemPrompt?: string }) => {
    const isQuality = opts.systemPrompt?.includes('quality assessor')
    const input = isQuality ? { results: qualityResults } : { results: languageResults }
    return Promise.resolve({ content: [{ type: 'tool_use', id: 'mock', name: 'output', input }] })
  })
}

describe('validatePostsBatch', () => {
  it('maps batch results back to slots by index', async () => {
    mockBatchCalls(
      [qualityItem(1, { overall_score: 9 }), qualityItem(2, { overall_score: 4 })],
      [languageItem(1), languageItem(2)]
    )

    const results = await validatePostsBatch({
      captions: ['post one', 'post two'],
      client: makeClient(),
      platform: 'Instagram',
      label: 'test',
    })

    expect(results).toHaveLength(2)
    expect(results[0]!.scores.overall_score).toBe(9)
    expect(results[1]!.scores.overall_score).toBe(4)
    expect(results[0]!.qualityScore).toBe(9)
  })

  it('fires exactly 2 LLM calls regardless of caption count', async () => {
    mockBatchCalls(
      [qualityItem(1), qualityItem(2), qualityItem(3)],
      [languageItem(1), languageItem(2), languageItem(3)]
    )

    await validatePostsBatch({
      captions: ['a', 'b', 'c'],
      client: makeClient(),
      platform: 'Instagram',
      label: 'test',
    })

    expect(callAnthropic).toHaveBeenCalledTimes(2)
  })

  it('scales quality maxTokens with caption count under the cap', async () => {
    mockBatchCalls([qualityItem(1), qualityItem(2)], [languageItem(1), languageItem(2)])

    await validatePostsBatch({
      captions: ['a', 'b'],
      client: makeClient(),
      platform: 'Instagram',
      label: 'test',
    })

    const qualityCall = callAnthropic.mock.calls.find((c) =>
      (c[0] as { systemPrompt?: string }).systemPrompt?.includes('quality assessor')
    )
    expect((qualityCall![0] as { maxTokens: number }).maxTokens).toBe(2048)
  })

  it('leaves a missing index slot at fallback defaults', async () => {
    // Model only reports item 2 — item 1 gets the neutral fallback
    mockBatchCalls([qualityItem(2, { overall_score: 3 })], [languageItem(1), languageItem(2)])

    const results = await validatePostsBatch({
      captions: ['a', 'b'],
      client: makeClient(),
      platform: 'Instagram',
      label: 'test',
    })

    expect(results[0]!.scores.overall_score).toBe(7)
    expect(results[1]!.scores.overall_score).toBe(3)
  })

  it('degrades all items when the quality batch call rejects', async () => {
    callAnthropic.mockImplementation((opts: { systemPrompt?: string }) => {
      if (opts.systemPrompt?.includes('quality assessor')) {
        return Promise.reject(new Error('model down'))
      }
      return Promise.resolve({
        content: [
          { type: 'tool_use', id: 'mock', name: 'output', input: { results: [languageItem(1)] } },
        ],
      })
    })

    const results = await validatePostsBatch({
      captions: ['a'],
      client: makeClient(),
      platform: 'Instagram',
      label: 'test',
    })

    expect(results[0]!.scores.overall_score).toBe(7)
    expect(results[0]!.validationWarnings).toContain('quality')
  })

  it('passes language through when the language batch call rejects', async () => {
    callAnthropic.mockImplementation((opts: { systemPrompt?: string }) => {
      if (opts.systemPrompt?.includes('quality assessor')) {
        return Promise.resolve({
          content: [
            { type: 'tool_use', id: 'mock', name: 'output', input: { results: [qualityItem(1)] } },
          ],
        })
      }
      return Promise.reject(new Error('model down'))
    })

    const results = await validatePostsBatch({
      captions: ['a'],
      client: makeClient(),
      platform: 'Instagram',
      label: 'test',
    })

    expect(results[0]!.language.passes).toBe(true)
    expect(results[0]!.scores.language_score).toBe(10)
    expect(results[0]!.validationWarnings).toContain('language')
  })

  it('keeps only failure notes when the model returns the full PASS/FAIL checklist', async () => {
    mockBatchCalls(
      [
        qualityItem(1, {
          structure_passes: false,
          structure_notes: [
            'PASS: Slide 1 is headline-only',
            'FAIL: Slide 2 headline is a topic label',
            'CAUTION — Main caption is dense',
          ],
        }),
      ],
      [languageItem(1)]
    )

    const results = await validatePostsBatch({
      captions: ['a'],
      client: makeClient(),
      platform: 'Instagram',
      label: 'test',
    })

    expect(results[0]!.criteria.structure_followed).toEqual({
      passes: false,
      notes: ['Slide 2 headline is a topic label', 'Main caption is dense'],
    })
  })

  it('treats auto-corrected language as clean and surfaces issues from quality', async () => {
    mockBatchCalls(
      [
        qualityItem(1, {
          overall_score: 5,
          issues: [{ type: 'weak_hook', description: 'Opens with filler' }],
          ai_tells: ['delve'],
        }),
      ],
      [
        languageItem(1, {
          issues: [
            {
              type: 'calque',
              original_text: 'x',
              issue_description: 'y',
              suggested_fix: 'z',
            },
          ],
          corrected_text: 'fixed text',
        }),
      ]
    )

    const results = await validatePostsBatch({
      captions: ['a'],
      client: makeClient(),
      platform: 'Instagram',
      label: 'test',
    })

    expect(results[0]!.scores.language_score).toBe(10)
    expect(results[0]!.language.corrected_text).toBe('fixed text')
    expect(results[0]!.criteria.issues).toHaveLength(1)
    expect(results[0]!.slop.ai_tells_found).toEqual(['delve'])
  })
})

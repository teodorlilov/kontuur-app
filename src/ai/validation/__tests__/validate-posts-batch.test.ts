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

/** Mocks the single merged judge call. */
function mockBatchCalls(results: unknown[]) {
  callAnthropic.mockResolvedValue({
    content: [{ type: 'tool_use', id: 'mock', name: 'output', input: { results } }],
  })
}

describe('validatePostsBatch', () => {
  it('maps batch results back to slots by index', async () => {
    mockBatchCalls([qualityItem(1, { overall_score: 9 }), qualityItem(2, { overall_score: 4 })])

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

  it('fires exactly 1 LLM call regardless of caption count', async () => {
    // Quality, source grounding and language used to be two parallel calls over the
    // same text. One judge means one verdict and one corrected version — the reason
    // a language rewrite can no longer silently revert a grounding correction.
    mockBatchCalls([qualityItem(1), qualityItem(2), qualityItem(3)])

    await validatePostsBatch({
      captions: ['a', 'b', 'c'],
      client: makeClient(),
      platform: 'Instagram',
      label: 'test',
    })

    expect(callAnthropic).toHaveBeenCalledTimes(1)
  })

  it('scales quality maxTokens with caption count under the cap', async () => {
    mockBatchCalls([qualityItem(1), qualityItem(2)])

    await validatePostsBatch({
      captions: ['a', 'b'],
      client: makeClient(),
      platform: 'Instagram',
      label: 'test',
    })

    const qualityCall = callAnthropic.mock.calls.find((c) =>
      (c[0] as { systemPrompt?: string }).systemPrompt?.includes('quality assessor')
    )
    expect((qualityCall![0] as { maxTokens: number }).maxTokens).toBe(4096)
  })

  it('caps maxTokens at the batch ceiling for large batches', async () => {
    mockBatchCalls([1, 2, 3, 4, 5].map((i) => qualityItem(i)))

    await validatePostsBatch({
      captions: ['a', 'b', 'c', 'd', 'e'],
      client: makeClient(),
      platform: 'Instagram',
      label: 'test',
    })

    expect((callAnthropic.mock.calls[0]![0] as { maxTokens: number }).maxTokens).toBe(8192)
  })

  it('states the client language rules once, not per merged section', async () => {
    // The merge pushed both prompt builders' language blocks into one system
    // prompt; the client's notes appeared three times before the de-dup.
    mockBatchCalls([qualityItem(1)])
    const client = makeClient()
    client.languageConfig!.languageNotes = 'UNIQUE_NOTES_MARKER'

    await validatePostsBatch({
      captions: ['a'],
      client,
      platform: 'Instagram',
      label: 'test',
    })

    const systemPrompt = (callAnthropic.mock.calls[0]![0] as { systemPrompt: string }).systemPrompt
    expect(systemPrompt.split('UNIQUE_NOTES_MARKER')).toHaveLength(2)
  })

  it('leaves a missing index slot at fallback defaults', async () => {
    // Model only reports item 2 — item 1 gets the neutral fallback
    mockBatchCalls([qualityItem(2, { overall_score: 3 })])

    const results = await validatePostsBatch({
      captions: ['a', 'b'],
      client: makeClient(),
      platform: 'Instagram',
      label: 'test',
    })

    expect(results[0]!.scores.overall_score).toBeNull()
    expect(results[1]!.scores.overall_score).toBe(3)
  })

  it('degrades every item to null scores when the single call rejects', async () => {
    // There is no longer a language call that can fail independently: a judge
    // outage is one event, not two.
    callAnthropic.mockRejectedValue(new Error('model down'))

    const results = await validatePostsBatch({
      captions: ['a'],
      client: makeClient(),
      platform: 'Instagram',
      label: 'test',
    })

    // The absent score *is* the record that no judgement happened — there is no
    // separate warnings array to keep in step with it.
    expect(results[0]!.scores.overall_score).toBeNull()
    expect(results[0]!.slop.reads_as_human).toBeNull()
  })

  it('keeps only failure notes when the model returns the full PASS/FAIL checklist', async () => {
    mockBatchCalls([
        qualityItem(1, {
          structure_passes: false,
          structure_notes: [
            'PASS: Slide 1 is headline-only',
            'FAIL: Slide 2 headline is a topic label',
            'CAUTION — Main caption is dense',
          ],
        }),
      ])

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
          language_issues: [
            { type: 'calque', original_text: 'x', issue_description: 'y', suggested_fix: 'z' },
          ],
          corrected_text: 'fixed text',
        }),
      ],
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

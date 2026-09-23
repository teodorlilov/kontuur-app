import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GenerationResult } from '@/ai/generation/types'

const mocks = vi.hoisted(() => ({
  persistStreamedDraft: vi.fn(),
  finishGenerationRun: vi.fn(),
  runGenerationBatch: vi.fn(),
  fetchIdeaById: vi.fn(),
}))
vi.mock('@/lib/auth/resolve-auth', () => ({
  resolveAuth: () => Promise.resolve({ ok: true, userId: 'u1', agencyId: 'a1', supabase: {} }),
}))
vi.mock('@/lib/auth/rate-limit', () => ({ aiRateLimitResponse: () => null }))
vi.mock('@/lib/billing/require-entitled', () => ({
  requireEntitledRoute: () => Promise.resolve(null),
}))
vi.mock('@/lib/queries/db', () => ({
  fetchClientById: () => Promise.resolve({ id: 'c1' }),
  fetchEngineContext: () =>
    Promise.resolve({ exemplars: { single: [], carousel: [] }, styleMemo: [] }),
}))
vi.mock('@/lib/queries/cache', () => ({
  getCachedEntitlement: () => Promise.resolve({ periodKey: '2026-09-01' }),
}))
vi.mock('@/lib/billing/spend-context', () => ({
  runAsSpender: (_spender: unknown, fn: () => Promise<unknown>) => fn(),
}))
vi.mock('@/lib/billing/usage', () => ({
  allowanceResponse: () => new Response(null, { status: 402 }),
}))
vi.mock('@/ai/research/research-orchestrator', () => ({
  performResearch: (input: { onTopic: (topic: unknown) => void }) => {
    input.onTopic({ description: 'Lip sync', count: 1 })
    return Promise.resolve()
  },
}))
vi.mock('@/lib/generation/runs', () => ({
  startGenerationRun: () => Promise.resolve({ runId: 'run-1' }),
  finishGenerationRun: (...args: unknown[]) => mocks.finishGenerationRun(...args),
  trackGenerationTheme: () => Promise.resolve(),
}))
vi.mock('@/ai/generation/generation-orchestrator', () => ({
  runGenerationBatch: (...args: unknown[]) => mocks.runGenerationBatch(...args),
}))
vi.mock('@/lib/generation/draft-posts', () => ({
  persistStreamedDraft: (...args: unknown[]) => mocks.persistStreamedDraft(...args),
}))
vi.mock('@/features/ideas/lib/ideas', () => ({
  fetchIdeaById: (...args: unknown[]) => mocks.fetchIdeaById(...args),
}))
vi.mock('@/lib/visual/generate-visual', () => ({
  fetchIdentityForGeneration: () => Promise.resolve({ palette: {}, style: 'editorial' }),
}))

import { POST } from '../generate-stream/route'

const CLIENT_DATA = {
  id: 'c1',
  name: 'About Social Media',
  niche: 'AI video',
  language: 'bg',
  tone: 'direct',
  targetAudience: 'marketers',
  avoidTopics: '',
  socialGoals: '',
  contentPillars: [],
  isHealthNiche: null,
  defaultCarouselSlides: 3,
  defaultPostType: 'single',
  languageNotes: '',
  languageConfig: {
    language: 'bg',
    formality: 'neutral',
    carouselSwipeCues: '',
    languageInstructions: '',
    languageNotes: '',
    formalityRules: null,
  },
  postHistory: [],
}

function request(ideaId?: string): Request {
  return new Request('https://kontuur.app/api/ai/generate-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: 'c1',
      postType: 'single',
      targetPostCount: 2,
      preloadedClientData: CLIENT_DATA,
      ideaId,
    }),
  })
}

function draft(id: string): GenerationResult {
  return {
    post: {
      id,
      client_id: 'c1',
      post_type: 'single',
      caption: `Caption ${id}`,
      status: 'draft',
      priority: false,
      topic_summary: `Topic ${id}`,
      slides_json: null,
      validation_json: null,
      quality_score_avg: 8,
      source_url: null,
      source_title: null,
      source_type: null,
      source_excerpt: null,
      client_source_id: null,
      pillar: null,
      target_date: null,
      created_at: '2026-09-20T08:00:00.000Z',
    },
    language: { passes: true, language_score: 10, issues: [], corrected_text: null },
    slop: { is_slop: false, ai_tells_found: [], human_score: 8 },
    criteria: { issues: [] },
    scores: { overall_score: 8 },
  } as unknown as GenerationResult
}

/** Plays two results through `onResult` the way the orchestrator does — awaited, one after the other. */
async function batch(ctx: { onResult?: (r: GenerationResult) => void | Promise<void> }) {
  for (const id of ['p1', 'p2']) {
    try {
      await ctx.onResult?.(draft(id))
    } catch {
      // The orchestrator logs a failed theme and moves on; the route never sees the throw.
    }
  }
  return []
}

async function readEvents(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text()
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

describe('POST /api/ai/generate-stream — every draft is a row before it is an event', () => {
  beforeEach(() => {
    mocks.persistStreamedDraft.mockReset().mockResolvedValue(undefined)
    mocks.finishGenerationRun.mockReset().mockResolvedValue(undefined)
    mocks.runGenerationBatch.mockReset().mockImplementation(batch)
    mocks.fetchIdeaById.mockReset().mockResolvedValue(null)
  })

  it("writes the run's idea on every draft, having checked it belongs to the agency", async () => {
    const ideaId = '8f1c0b6e-1c8a-4f2e-9a3d-2b5c7e9d1a40'
    mocks.fetchIdeaById.mockResolvedValue({ id: ideaId })

    await readEvents(await POST(request(ideaId)))

    expect(mocks.fetchIdeaById).toHaveBeenCalledWith(ideaId, 'a1')
    // Every draft of the run carries it: which one fulfils the idea is settled at approve.
    for (const call of mocks.persistStreamedDraft.mock.calls) {
      expect(call[1]).toMatchObject({ clientIdeaId: ideaId })
    }
  })

  it('an idea this agency cannot see is dropped, and the run still delivers its drafts', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.fetchIdeaById.mockResolvedValue(null)

    const events = await readEvents(await POST(request('8f1c0b6e-1c8a-4f2e-9a3d-2b5c7e9d1a41')))

    expect(events.filter((e) => e.type === 'result')).toHaveLength(2)
    for (const call of mocks.persistStreamedDraft.mock.calls) {
      expect(call[1]).toMatchObject({ clientIdeaId: null })
    }
    expect(warn).toHaveBeenCalled()
  })

  it('persists each draft under the run, in landing order, then streams it', async () => {
    const order: string[] = []
    mocks.persistStreamedDraft.mockImplementation(
      (_db: unknown, input: { post: { id: string } }) => {
        order.push(`persist:${input.post.id}`)
        return Promise.resolve()
      }
    )

    const events = await readEvents(await POST(request()))
    const results = events.filter((e) => e.type === 'result')

    expect(results.map((e) => (e.data as GenerationResult).post.id)).toEqual(['p1', 'p2'])
    expect(order).toEqual(['persist:p1', 'persist:p2'])
    expect(mocks.persistStreamedDraft).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        post: expect.objectContaining({ id: 'p2' }),
        identity: { palette: {}, style: 'editorial' },
        run: { id: 'run-1', index: 1, clientId: 'c1' },
      })
    )
    expect(mocks.finishGenerationRun).toHaveBeenCalledWith(
      expect.anything(),
      'run-1',
      expect.objectContaining({ status: 'complete', reserved: 2, landed: 2 })
    )
  })

  it('a draft that could not be written never reaches the browser and is not billed', async () => {
    mocks.persistStreamedDraft
      .mockRejectedValueOnce(new Error('Failed to save generated posts: boom'))
      .mockResolvedValueOnce(undefined)

    const events = await readEvents(await POST(request()))
    const results = events.filter((e) => e.type === 'result')

    expect(results.map((e) => (e.data as GenerationResult).post.id)).toEqual(['p2'])
    expect(mocks.finishGenerationRun).toHaveBeenCalledWith(
      expect.anything(),
      'run-1',
      expect.objectContaining({ status: 'complete', reserved: 2, landed: 1 })
    )
  })

  it('once the browser is gone, nothing more is written or billed', async () => {
    let releaseSecond!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseSecond = resolve
    })
    mocks.runGenerationBatch.mockImplementation(
      async (ctx: { onResult?: (r: GenerationResult) => void | Promise<void> }) => {
        await ctx.onResult?.(draft('p1'))
        await gate
        await ctx.onResult?.(draft('p2'))
        return []
      }
    )

    const response = await POST(request())
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let text = ''
    while (!text.includes('"type":"result"')) {
      const { value, done } = await reader.read()
      if (done) break
      text += decoder.decode(value)
    }
    // Closing the tab cancels the body; the run's later drafts must not land.
    await reader.cancel()
    releaseSecond()
    await vi.waitFor(() => expect(mocks.finishGenerationRun).toHaveBeenCalled())

    expect(mocks.persistStreamedDraft).toHaveBeenCalledTimes(1)
    expect(mocks.finishGenerationRun).toHaveBeenCalledWith(
      expect.anything(),
      'run-1',
      expect.objectContaining({ status: 'complete', reserved: 2, landed: 1 })
    )
  })
})

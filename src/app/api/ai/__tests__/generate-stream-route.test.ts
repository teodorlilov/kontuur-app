import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GenerationResult } from '@/ai/generation/types'

const mocks = vi.hoisted(() => ({
  persistStreamedDraft: vi.fn(),
  startGenerationRun: vi.fn(),
  finishGenerationRun: vi.fn(),
  runGenerationBatch: vi.fn(),
  fetchIdeaById: vi.fn(),
  fetchIdentityForGeneration: vi.fn(),
  readUsage: vi.fn(),
  fetchWorkspaceOwed: vi.fn(),
  entitlement: vi.fn(),
  spenderDepth: 0,
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
  getCachedEntitlement: () => Promise.resolve(mocks.entitlement()),
  getCachedAgencyClients: () => Promise.resolve([{ id: 'c1' }, { id: 'c2' }]),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: () => ({}) }))
vi.mock('@/lib/visual/owed-images', () => ({
  fetchWorkspaceOwed: (...args: unknown[]) => mocks.fetchWorkspaceOwed(...args),
}))
vi.mock('@/lib/billing/spend-context', () => ({
  runAsSpender: (_spender: unknown, fn: () => Promise<unknown>) => {
    mocks.spenderDepth++
    try {
      return fn()
    } finally {
      mocks.spenderDepth--
    }
  },
}))
vi.mock('@/lib/billing/usage', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/billing/usage')>()
  return {
    AllowanceError: actual.AllowanceError,
    allowanceResponse: actual.allowanceResponse,
    readUsage: (...args: unknown[]) => mocks.readUsage(...args),
  }
})
vi.mock('@/ai/research/research-orchestrator', () => ({
  performResearch: (input: { onTopic: (topic: unknown) => void }) => {
    input.onTopic({ description: 'Lip sync', count: 1 })
    return Promise.resolve()
  },
}))
vi.mock('@/lib/generation/runs', () => ({
  startGenerationRun: (...args: unknown[]) => mocks.startGenerationRun(...args),
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
  fetchIdentityForGeneration: (...args: unknown[]) => mocks.fetchIdentityForGeneration(...args),
}))

import { POST } from '../generate-stream/route'
import { OWED_IMAGES_UNKNOWN } from '@/lib/billing/copy'
import { UNMETERED } from '@/lib/billing/plans'

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

/**
 * Plays two results through `onResult` the way the orchestrator does: awaited, one after the
 * other, and a throw swallowed, since `execute` (src/ai/generation/generation-orchestrator.ts)
 * logs a failed theme and moves on, so the route never sees it.
 */
async function batch(ctx: { onResult?: (r: GenerationResult) => void | Promise<void> }) {
  for (const id of ['p1', 'p2']) {
    await Promise.resolve()
      .then(() => ctx.onResult?.(draft(id)))
      .catch(() => undefined)
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
    mocks.startGenerationRun.mockReset().mockResolvedValue({ runId: 'run-1' })
    mocks.entitlement.mockReset().mockReturnValue({
      periodKey: '2026-09-01',
      limits: { draft: 100, image: 100, rewrite: 30 },
      resetsOn: new Date('2026-10-01T00:00:00Z'),
      timezone: 'Europe/Sofia',
      paymentFailed: false,
    })
    mocks.readUsage.mockReset().mockResolvedValue({
      landed: { draft: 0, image: 0, rewrite: 0 },
      committed: { draft: 0, image: 0, rewrite: 0 },
    })
    mocks.fetchWorkspaceOwed.mockReset().mockResolvedValue({ posts: 0, images: 0 })
    mocks.finishGenerationRun.mockReset().mockResolvedValue(undefined)
    mocks.fetchIdentityForGeneration
      .mockReset()
      .mockImplementation(() =>
        mocks.spenderDepth > 0
          ? Promise.resolve({ palette: {}, style: 'editorial' })
          : Promise.reject(new Error('a paid kit read outside the spender'))
      )
    mocks.runGenerationBatch.mockReset().mockImplementation(batch)
    mocks.fetchIdeaById.mockReset().mockResolvedValue(null)
  })

  it("writes the run's idea on every draft, since approve settles which one fulfils it, having checked it is the agency's", async () => {
    const ideaId = '8f1c0b6e-1c8a-4f2e-9a3d-2b5c7e9d1a40'
    mocks.fetchIdeaById.mockResolvedValue({ id: ideaId })

    await readEvents(await POST(request(ideaId)))

    expect(mocks.fetchIdeaById).toHaveBeenCalledWith(ideaId, 'a1')
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
        run: { id: 'run-1', index: 1 },
      })
    )
    expect(mocks.finishGenerationRun).toHaveBeenCalledWith(
      expect.anything(),
      'run-1',
      expect.objectContaining({ status: 'complete', reserved: 2, landed: 2 })
    )
  })

  it('answers 500 before reserving when the owed pictures cannot be read — an unread figure is not zero', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.fetchWorkspaceOwed.mockRejectedValue(new Error('posts read failed'))
    const response = await POST(request())
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: OWED_IMAGES_UNKNOWN })
    expect(mocks.startGenerationRun).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('never reads owed pictures for an image pool with no limit', async () => {
    mocks.entitlement.mockReturnValue({
      periodKey: '2026-09-01',
      limits: { draft: UNMETERED, image: UNMETERED, rewrite: UNMETERED },
      resetsOn: null,
      timezone: 'Europe/Sofia',
      paymentFailed: false,
    })
    mocks.fetchWorkspaceOwed.mockRejectedValue(new Error('posts read failed'))
    await POST(request())
    expect(mocks.fetchWorkspaceOwed).not.toHaveBeenCalled()
    expect(mocks.startGenerationRun).toHaveBeenCalled()
  })

  it('refuses, before reserving, a run the workspace cannot illustrate once owed pictures are set aside — 98 of 100 used and 1 owed leave one', async () => {
    mocks.readUsage.mockResolvedValue({
      landed: { draft: 0, image: 98, rewrite: 0 },
      committed: { draft: 0, image: 98, rewrite: 0 },
    })
    mocks.fetchWorkspaceOwed.mockResolvedValue({ posts: 1, images: 1 })
    const response = await POST(request())
    expect(response.status).toBe(402)
    const body = await response.json()
    expect(body.error).toMatch(
      /^1 post still waiting for pictures needs 1 AI image; you have 2 left/
    )
    expect(mocks.startGenerationRun).not.toHaveBeenCalled()
  })

  it('answers 500 before any stream when the run could not be opened: without its row nothing could settle its drafts', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.startGenerationRun.mockResolvedValue({ runId: null, slotTaken: false })
    const response = await POST(request())
    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).not.toBe('application/x-ndjson')
    expect(mocks.runGenerationBatch).not.toHaveBeenCalled()
    error.mockRestore()
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

  it('once the closed tab cancels the response body, no later draft is written or billed', async () => {
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

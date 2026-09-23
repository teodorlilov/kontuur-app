import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostData } from '@/types/post'

const persistRewrite = vi.fn()
vi.mock('@/lib/actions/post-actions', () => ({
  persistRewrite: (...args: unknown[]) => persistRewrite(...args),
}))

import { rewriteDraft } from '../rewrite-draft'

const POST = {
  id: 'p1',
  client_id: 'c1',
  post_type: 'single',
  caption: 'old',
  slides_json: null,
  source_excerpt: null,
  source_url: null,
  rewrite_count: 1,
} as unknown as PostData

const INPUT = { post: POST, caption: 'old', slidesJson: null, aiTells: [], qualityIssues: [] }

function answer(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: status < 400, status, json: () => Promise.resolve(body) })
  )
}

const REWRITTEN = {
  caption: 'new',
  slides_json: null,
  quality_score_avg: 8,
  language: {},
  slop: {},
  sourceGrounding: null,
  criteria: {},
  scores: {},
}

describe('rewriteDraft', () => {
  beforeEach(() => {
    persistRewrite.mockReset().mockResolvedValue({ ok: true, data: { rewriteCount: 5 } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it("carries the route's own sentence back on a refusal, so the person reads why", async () => {
    answer(402, { error: "You've used all 30 rewrites for this period. Resets on 1 October." })
    expect(await rewriteDraft(INPUT)).toEqual({
      ok: false,
      error: "You've used all 30 rewrites for this period. Resets on 1 October.",
    })
  })

  it('falls back to the generic sentence when the failure has no words', async () => {
    answer(500, {})
    expect(await rewriteDraft(INPUT)).toEqual({ ok: false, error: 'Failed to rewrite post' })
  })

  it('keeps the rewrite on the row and maps it back with the server’s count', async () => {
    answer(200, REWRITTEN)
    const outcome = await rewriteDraft(INPUT)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(persistRewrite).toHaveBeenCalledWith('p1', {
      caption: 'new',
      slides_json: null,
      quality_score_avg: 8,
      validation: outcome.validation,
    })
    expect(outcome.updatedPost.caption).toBe('new')
    expect(outcome.updatedPost.was_rewritten).toBe(true)
    // The server's number, never a client-side guess from a possibly stale copy.
    expect(outcome.updatedPost.rewrite_count).toBe(5)
  })

  it('a rewrite that could not be kept is reported, not shown as done', async () => {
    answer(200, REWRITTEN)
    persistRewrite.mockResolvedValue({ ok: false, error: 'Post not found' })
    expect(await rewriteDraft(INPUT)).toEqual({ ok: false, error: 'Failed to save the rewrite' })
  })

  it('a persist that throws is still a failed save, not a failed rewrite', async () => {
    answer(200, REWRITTEN)
    persistRewrite.mockRejectedValue(new Error('network'))
    expect(await rewriteDraft(INPUT)).toEqual({ ok: false, error: 'Failed to save the rewrite' })
  })

  it('refused rewrites never reach the row', async () => {
    answer(402, { error: 'used up' })
    await rewriteDraft(INPUT)
    expect(persistRewrite).not.toHaveBeenCalled()
  })
})

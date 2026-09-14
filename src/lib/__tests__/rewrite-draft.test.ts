import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PostData } from '@/types/post'
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

describe('rewriteDraft', () => {
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

  it('maps a rewrite back onto the post and counts it', async () => {
    answer(200, {
      caption: 'new',
      slides_json: null,
      quality_score_avg: 8,
      language: {},
      slop: {},
      sourceGrounding: null,
      criteria: {},
      scores: {},
    })
    const outcome = await rewriteDraft(INPUT)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.updatedPost.caption).toBe('new')
    expect(outcome.updatedPost.was_rewritten).toBe(true)
    expect(outcome.updatedPost.rewrite_count).toBe(2)
  })
})

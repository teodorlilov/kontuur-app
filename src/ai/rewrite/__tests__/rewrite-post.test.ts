import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rewriteCaption: vi.fn(),
  rewriteCarousel: vi.fn(),
  validatePost: vi.fn(),
}))

vi.mock('@/ai/rewrite/prompts/rewrite-prompts', () => ({
  rewriteCaption: mocks.rewriteCaption,
  rewriteCarousel: mocks.rewriteCarousel,
}))
vi.mock('@/ai/validation/validate-post', () => ({ validatePost: mocks.validatePost }))

import { performRewrite } from '../rewrite-post'
import type { RewriteContext } from '../types'
import type { PostValidationResult } from '@/ai/validation/types'
import type { ClientData } from '@/lib/clients/fetch-client-data'

/**
 * The client only passes through to the mocked model calls, so none of its fields are read.
 * WHY as: a full `ClientData` would restate a fixture this test never looks at.
 */
const CLIENT = { id: 'client-1' } as ClientData

const CLEAN: PostValidationResult = {
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

function context(overrides: Partial<RewriteContext>): RewriteContext {
  return {
    caption: 'Original caption',
    postType: 'single',
    aiTells: ['Generic opener'],
    rewriteReason: 'manual',
    client: CLIENT,
    ...overrides,
  }
}

describe('performRewrite', () => {
  beforeEach(() => {
    mocks.rewriteCaption.mockReset().mockResolvedValue('Rewritten caption')
    mocks.rewriteCarousel.mockReset()
    mocks.validatePost.mockReset().mockResolvedValue(CLEAN)
  })

  it('merges a carousel’s rewritten slides onto the originals and judges them', async () => {
    const slides = [
      { headline: 'Old one', body: 'Old body one' },
      { headline: 'Old two', body: 'Old body two' },
    ]
    const rewritten = [
      { headline: 'New one', body: 'New body one' },
      { headline: 'New two', body: 'New body two' },
    ]
    mocks.rewriteCarousel.mockResolvedValue({ main_caption: 'New caption', slides: rewritten })

    const result = await performRewrite(context({ postType: 'carousel', slidesJson: slides }))

    expect(mocks.validatePost).toHaveBeenCalledWith(
      expect.objectContaining({ caption: 'New caption', slides: rewritten })
    )
    expect(result.caption).toBe('New caption')
    expect(result.slides_json).toEqual(rewritten)
    expect(mocks.rewriteCaption).not.toHaveBeenCalled()
  })

  it('rewrites a single post’s caption, judges it without slides, and hands slidesJson back', async () => {
    const slides = [{ headline: 'Kept', body: 'As it was' }]

    const result = await performRewrite(context({ slidesJson: slides }))

    expect(mocks.validatePost).toHaveBeenCalledWith(
      expect.objectContaining({ caption: 'Rewritten caption', slides: undefined })
    )
    expect(result.caption).toBe('Rewritten caption')
    expect(result.slides_json).toBe(slides)
  })

  it('answers null slides for a single post that carried none', async () => {
    const result = await performRewrite(context({}))
    expect(result.slides_json).toBeNull()
  })

  it('refuses a carousel with no slides before any model call', async () => {
    await expect(performRewrite(context({ postType: 'carousel' }))).rejects.toThrow(
      'slides_json is missing'
    )
    expect(mocks.rewriteCarousel).not.toHaveBeenCalled()
    expect(mocks.validatePost).not.toHaveBeenCalled()
  })
})

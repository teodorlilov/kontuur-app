import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseServerClient } from '@/lib/auth/helpers'
import type { PostImage } from '@/types/api'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  fetchImagesByPost: vi.fn(),
  fetchCanvasDocPositions: vi.fn(),
  fetchVisualJobs: vi.fn(),
}))
vi.mock('@/lib/posts/fetch-post-images', () => ({
  fetchImagesByPost: (...args: unknown[]) => mocks.fetchImagesByPost(...args),
  fetchCanvasDocPositions: (...args: unknown[]) => mocks.fetchCanvasDocPositions(...args),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: () => ({}) }))
vi.mock('@/lib/visual/visual-jobs', () => ({
  fetchVisualJobs: (...args: unknown[]) => mocks.fetchVisualJobs(...args),
}))

import { fetchEditorialPosts } from '../fetch-editorial-posts'

type QueryResult = {
  data: Array<Record<string, unknown>> | null
  error: { message: string } | null
}

/** Records the filters the query was built with and replays one canned result. */
function makeSupabase(result: QueryResult) {
  const filters: Array<[string, unknown]> = []
  const query = {
    in: (column: string, value: unknown) => {
      filters.push([column, value])
      return query
    },
    eq: (column: string, value: unknown) => {
      filters.push([column, value])
      return query
    },
    order: () => Promise.resolve(result),
  }
  const supabase = {
    from: () => ({ select: () => query }),
  } as unknown as SupabaseServerClient
  return { supabase, filters }
}

const STORED_VALIDATION = {
  criteria: { issues: [], ai_tells: [], worst_offending_phrase: null },
  scores: { overall_score: 8, human_score: 7, language_score: 9, source_score: null },
  language: { passes: true, language_score: 9, issues: [] },
  slop: { is_slop: false, ai_tells_found: [], human_score: 7 },
}

const image: PostImage = {
  id: 'img-1',
  publicUrl: 'https://cdn/1.jpg',
  storagePath: 'c1/p1/1.jpg',
  position: 0,
  fileName: 'visual-0.jpg',
  fileSize: 10,
  contentType: 'image/jpeg',
}

beforeEach(() => {
  mocks.fetchImagesByPost.mockReset().mockResolvedValue(new Map([['p1', [image]]]))
  mocks.fetchCanvasDocPositions.mockReset().mockResolvedValue(new Map([['p1', [0]]]))
  mocks.fetchVisualJobs.mockReset().mockResolvedValue(new Map([['p2', [1]]]))
})

describe('fetchEditorialPosts', () => {
  it('asks for the given status across the given clients and joins images and docs by id', async () => {
    const { supabase, filters } = makeSupabase({
      data: [
        { id: 'p1', client_id: 'c1', validation_json: STORED_VALIDATION, quality_score_avg: 8 },
        { id: 'p2', client_id: 'c2', validation_json: null, quality_score_avg: 6 },
      ],
      error: null,
    })

    const posts = await fetchEditorialPosts(supabase, ['c1', 'c2'], 'draft')

    expect(filters).toEqual([
      ['client_id', ['c1', 'c2']],
      ['status', 'draft'],
    ])
    expect(mocks.fetchImagesByPost).toHaveBeenCalledWith(['p1', 'p2'])
    expect(posts[0]).toMatchObject({
      post: { id: 'p1' },
      images: [image],
      composedPositions: [0],
      generatingPositions: [],
      needsSlopCheck: false,
    })
    expect(posts[0]?.validation.scores.overall_score).toBe(8)
    // A row with no stored evidence gets the fallback built from its score, and no images — but
    // its position 1 is being generated right now, so no surface may ask for that one.
    expect(posts[1]).toMatchObject({
      images: [],
      composedPositions: [],
      generatingPositions: [1],
      needsSlopCheck: true,
    })
    expect(posts[1]?.validation.scores.overall_score).toBe(6)
  })

  it('reads nothing for no clients — and never reaches the image tables', async () => {
    const { supabase } = makeSupabase({ data: [], error: null })
    expect(await fetchEditorialPosts(supabase, [], 'pending_review')).toEqual([])
    expect(mocks.fetchImagesByPost).not.toHaveBeenCalled()
  })

  it('throws on a failed query rather than answering "nothing waiting"', async () => {
    const { supabase } = makeSupabase({ data: null, error: { message: 'timeout' } })
    await expect(fetchEditorialPosts(supabase, ['c1'], 'draft')).rejects.toThrow(
      'editorial post query failed: timeout'
    )
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminClient } from '@/lib/supabase/admin'
import type { PostImage } from '@/types/api'

const mocks = vi.hoisted(() => ({ fetchImagesByPost: vi.fn(), fetchVisualJobs: vi.fn() }))
vi.mock('@/lib/posts/fetch-post-images', () => ({
  fetchImagesByPost: (...args: unknown[]) => mocks.fetchImagesByPost(...args),
}))
vi.mock('../visual-jobs', () => ({
  fetchVisualJobs: (...args: unknown[]) => mocks.fetchVisualJobs(...args),
}))

import { fetchOwedImages, fetchWorkspaceOwed, owedImagesOf, sumOwed } from '../owed-images'
import { MAX_VISUAL_ATTEMPTS } from '../visual-backlog'

function slides(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    slide_number: i + 1,
    headline: `h${i}`,
    body: '',
  }))
}

function carousel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    client_id: 'c1',
    status: 'draft',
    post_type: 'carousel',
    slides_json: slides(4),
    quality_score_avg: 8,
    visuals_attempts: 0,
    ...overrides,
  }
}

/** A stored picture at `position`. WHY as: the owed count reads a picture's position alone. */
const painted = (position: number) => ({ position }) as PostImage

describe('owedImagesOf', () => {
  it('owes every position with no picture, less those a live claim is making, whose image is already reserved', () => {
    const owed = owedImagesOf([
      { post: carousel(), images: [painted(0)], generatingPositions: [1] },
    ])
    expect(owed).toEqual(new Map([['c1', { posts: 1, images: 2 }]]))
  })

  it('owes nothing for a review-queue post the visuals cron will never paint', () => {
    const owed = owedImagesOf([
      {
        post: carousel({ status: 'pending_review', quality_score_avg: 3 }),
        images: [],
        generatingPositions: [],
      },
      {
        post: carousel({ status: 'pending_review', visuals_attempts: MAX_VISUAL_ATTEMPTS }),
        images: [],
        generatingPositions: [],
      },
    ])
    expect(owed).toEqual(new Map())
  })

  it('sums a workspace across maps, or only the clients named', () => {
    const drafts = new Map([
      ['c1', { posts: 1, images: 4 }],
      ['c2', { posts: 2, images: 2 }],
    ])
    const review = new Map([['c1', { posts: 1, images: 1 }]])
    expect(sumOwed([drafts, review])).toEqual({ posts: 4, images: 7 })
    expect(sumOwed([drafts, review], ['c1'])).toEqual({ posts: 2, images: 5 })
  })
})

/**
 * The posts read as `fetchOwedImages` pages it, answering each range with `answer`, with the
 * ranges and `in` filters it asked for. WHY as: only the chain the reader builds exists.
 */
function pagedPosts(
  answer: (
    from: number,
    to: number
  ) => { data: unknown[] | null; error: { message: string } | null }
) {
  const ranges: Array<[number, number]> = []
  const filters: Array<[string, unknown]> = []
  const read = {
    select: () => read,
    in: (column: string, values: unknown) => {
      filters.push([column, values])
      return read
    },
    order: () => read,
    range: (from: number, to: number) => {
      ranges.push([from, to])
      return Promise.resolve(answer(from, to))
    },
  }
  return { admin: { from: () => read } as unknown as AdminClient, ranges, filters }
}

describe('fetchOwedImages', () => {
  beforeEach(() => {
    mocks.fetchImagesByPost.mockReset().mockResolvedValue(new Map([['p1', [painted(0)]]]))
    mocks.fetchVisualJobs.mockReset().mockResolvedValue(new Map([['p1', [1]]]))
  })

  it('gives the same figure for a post as the count the generate page runs over rows it loaded', async () => {
    const row = carousel()
    const { admin } = pagedPosts(() => ({ data: [row], error: null }))
    const read = await fetchOwedImages(admin, ['c1'], ['draft'])
    const loaded = owedImagesOf([{ post: row, images: [painted(0)], generatingPositions: [1] }])
    expect(read).toEqual(loaded)
    expect(read.get('c1')).toEqual({ posts: 1, images: 2 })
  })

  it('pages its posts, so a set past one page is counted whole', async () => {
    const rows = Array.from({ length: 150 }, (_, i) => carousel({ id: `p${i + 100}` }))
    const { admin, ranges } = pagedPosts((from, to) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }))
    const read = await fetchOwedImages(admin, ['c1'], ['draft'])
    expect(ranges).toEqual([
      [0, 99],
      [100, 199],
    ])
    expect(read.get('c1')).toEqual({ posts: 150, images: 600 })
  })

  it('throws on a failed read — an unknown figure is not zero', async () => {
    const { admin } = pagedPosts(() => ({ data: null, error: { message: 'down' } }))
    await expect(fetchOwedImages(admin, ['c1'], ['draft'])).rejects.toThrow('down')
  })
})

describe('fetchWorkspaceOwed', () => {
  beforeEach(() => {
    mocks.fetchImagesByPost.mockReset().mockResolvedValue(new Map())
    mocks.fetchVisualJobs.mockReset().mockResolvedValue(new Map())
  })

  it('reads every undecided post of the clients and sums them into one figure', async () => {
    const { admin, filters } = pagedPosts(() => ({
      data: [carousel({ id: 'p1' }), carousel({ id: 'p2', client_id: 'c2' })],
      error: null,
    }))
    expect(await fetchWorkspaceOwed(admin, ['c1', 'c2'])).toEqual({ posts: 2, images: 8 })
    expect(filters).toEqual([
      ['client_id', ['c1', 'c2']],
      ['status', ['draft', 'pending_review']],
    ])
  })
})

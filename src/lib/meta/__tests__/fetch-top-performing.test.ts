import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchTopPerformingPosts } from '../instagram-metrics'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
})

function media(id: string, likeCount: number) {
  return {
    id,
    caption: `caption ${id}`,
    timestamp: '2026-07-15T10:00:00Z',
    media_type: 'IMAGE',
    like_count: likeCount,
    comments_count: 0,
    permalink: `https://instagram.com/p/${id}`,
  }
}

function mockMediaAndInsights(
  mediaList: ReturnType<typeof media>[],
  interactionsById: Record<string, number>
) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/media?')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: mediaList }) })
    }
    const id = Object.keys(interactionsById).find((mediaId) => url.includes(`/${mediaId}/insights`))
    const total = id ? interactionsById[id] : 0
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ name: 'total_interactions', values: [{ value: total }] }],
        }),
    })
  })
}

describe('fetchTopPerformingPosts', () => {
  it('sorts by insights engagement and applies the limit', async () => {
    mockMediaAndInsights([media('a', 5), media('b', 50), media('c', 10)], { a: 300, b: 20, c: 100 })

    const posts = await fetchTopPerformingPosts('acct', 'token', '2026-07-01', '2026-07-29', 2)

    expect(posts.map((p) => p.id)).toEqual(['a', 'c'])
  })

  it('falls back to public counts when insights return zero', async () => {
    mockMediaAndInsights([media('a', 5), media('b', 50)], { a: 0, b: 0 })

    const posts = await fetchTopPerformingPosts('acct', 'token', '2026-07-01', '2026-07-29', 2)

    expect(posts[0]!.id).toBe('b') // 50 likes beats 5
  })

  it('returns [] when the media call fails', async () => {
    mockFetch.mockResolvedValue({ ok: false })

    const posts = await fetchTopPerformingPosts('acct', 'token', '2026-07-01', '2026-07-29', 5)
    expect(posts).toEqual([])
  })
})

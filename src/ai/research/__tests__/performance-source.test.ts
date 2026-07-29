import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetchTopPerformingPosts = vi.fn()
vi.mock('@/lib/meta/instagram-metrics', () => ({
  fetchTopPerformingPosts: (...args: unknown[]) => mockFetchTopPerformingPosts(...args),
}))

import { fetchPerformanceItems } from '../performance-source'
import type { SupabaseClient } from '@supabase/supabase-js'

beforeEach(() => {
  vi.clearAllMocks()
})

function igPost(id: string, caption: string | null, likes: number) {
  return {
    id,
    caption,
    timestamp: '2026-07-01T10:00:00Z',
    media_type: 'IMAGE',
    like_count: likes,
    comments_count: 3,
    saved: 5,
    shares: 1,
    permalink: `https://instagram.com/p/${id}`,
  }
}

/** Minimal supabase stub: social_connections single row + posts pillar-join rows. */
function makeSupabase(
  connection: Record<string, unknown> | null,
  publishedRows: Array<{ ig_media_id: string; pillar: string }> = []
): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === 'social_connections') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: connection }) }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          eq: () => ({ in: () => Promise.resolve({ data: publishedRows }) }),
        }),
      }
    },
    // Test stub covers only the two query shapes fetchPerformanceItems uses
  } as unknown as SupabaseClient
}

const CONNECTION = {
  account_id: 'ig-acct',
  access_token: 'token',
  token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
}

describe('fetchPerformanceItems', () => {
  it('returns [] without a connected instagram account', async () => {
    const items = await fetchPerformanceItems(makeSupabase(null), 'client-1')
    expect(items).toEqual([])
    expect(mockFetchTopPerformingPosts).not.toHaveBeenCalled()
  })

  it('returns [] when the token is expired', async () => {
    const expired = { ...CONNECTION, token_expires_at: new Date(Date.now() - 1000).toISOString() }
    const items = await fetchPerformanceItems(makeSupabase(expired), 'client-1')
    expect(items).toEqual([])
    expect(mockFetchTopPerformingPosts).not.toHaveBeenCalled()
  })

  it('maps top posts to performance items and joins pillars for published posts', async () => {
    mockFetchTopPerformingPosts.mockResolvedValue([
      igPost('m1', 'Our best recovery tips', 100),
      igPost('m2', 'Organic post not from Postflow', 80),
    ])
    const supabase = makeSupabase(CONNECTION, [{ ig_media_id: 'm1', pillar: 'Educational' }])

    const items = await fetchPerformanceItems(supabase, 'client-1')

    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({
      caption: 'Our best recovery tips',
      pillar: 'Educational',
      engagementSummary: '100 likes · 3 comments · 5 saves · 1 shares',
      permalink: 'https://instagram.com/p/m1',
    })
    expect(items[1]!.pillar).toBeUndefined()
  })

  it('drops caption-less posts', async () => {
    mockFetchTopPerformingPosts.mockResolvedValue([
      igPost('m1', null, 100),
      igPost('m2', '  ', 90),
    ])

    const items = await fetchPerformanceItems(makeSupabase(CONNECTION), 'client-1')
    expect(items).toEqual([])
  })

  it('returns [] when the meta fetch throws — never blocks a run', async () => {
    mockFetchTopPerformingPosts.mockRejectedValue(new Error('meta down'))

    const items = await fetchPerformanceItems(makeSupabase(CONNECTION), 'client-1')
    expect(items).toEqual([])
  })
})

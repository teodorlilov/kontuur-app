import { describe, it, expect } from 'vitest'
import { fetchPerformanceItems } from '../performance-source'
import type { SupabaseClient } from '@supabase/supabase-js'

function metricRow(
  igMediaId: string,
  caption: string | null,
  likes: number,
  postId: string | null = null
) {
  return {
    ig_media_id: igMediaId,
    post_id: postId,
    media_type: 'IMAGE',
    media_product_type: 'FEED',
    permalink: `https://instagram.com/p/${igMediaId}`,
    thumbnail_url: null,
    caption,
    posted_at: '2026-08-01T10:00:00Z',
    reach: 500,
    views: 900,
    like_count: likes,
    comments_count: 3,
    saved: 5,
    shares: 1,
    total_interactions: likes + 9,
    follows: 2,
    profile_visits: 40,
  }
}

/** Minimal supabase stub: the connection scope, the ig_post_metrics read, the posts pillar join. */
function makeSupabase(
  metricRows: Array<Record<string, unknown>> | Error,
  publishedRows: Array<{ id: string; pillar: string }> = [],
  accountId: string | null = 'acct-1'
): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === 'social_connections') {
        return {
          // Shape mirrors fetchCurrentIgAccountId: .limit(1) before .maybeSingle(),
          // so a duplicate connection row picks one instead of throwing.
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: accountId === null ? null : { account_id: accountId },
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'ig_post_metrics') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({
                  not: () => ({
                    order: () => ({
                      limit: () =>
                        metricRows instanceof Error
                          ? Promise.resolve({ data: null, error: { message: metricRows.message } })
                          : Promise.resolve({ data: metricRows, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      return {
        select: () => ({ in: () => Promise.resolve({ data: publishedRows }) }),
      }
    },
    // Test stub covers only the three query shapes fetchPerformanceItems uses
  } as unknown as SupabaseClient
}

describe('fetchPerformanceItems', () => {
  it('maps stored rows to performance items and joins pillars for published posts', async () => {
    const supabase = makeSupabase(
      [
        metricRow('m1', 'Our best recovery tips', 100, 'post-1'),
        metricRow('m2', 'Organic post not from Postflow', 80),
      ],
      [{ id: 'post-1', pillar: 'Educational' }]
    )

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

  it('drops caption-less rows', async () => {
    const items = await fetchPerformanceItems(
      makeSupabase([metricRow('m1', null, 100), metricRow('m2', '  ', 90)]),
      'client-1'
    )
    expect(items).toEqual([])
  })

  it('returns [] when a client has no stored metrics yet', async () => {
    const items = await fetchPerformanceItems(makeSupabase([]), 'client-1')
    expect(items).toEqual([])
  })

  it('returns [] when the read fails — never blocks a run', async () => {
    const items = await fetchPerformanceItems(makeSupabase(new Error('db down')), 'client-1')
    expect(items).toEqual([])
  })

  it('returns [] when the client has no Instagram connection — nothing is attributable', async () => {
    const items = await fetchPerformanceItems(
      makeSupabase([metricRow('m1', 'Would leak without the account scope', 100)], [], null),
      'client-1'
    )
    expect(items).toEqual([])
  })
})

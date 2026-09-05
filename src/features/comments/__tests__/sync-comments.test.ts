import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The half-hourly sync.
 *
 * The behaviour worth pinning is what it does NOT do. A comments queue that
 * refetched every post on every run would cost ~66 Graph calls per client-hour on a
 * quota the publish cron shares, so the whole design rests on the count comparison
 * skipping posts that have not changed. Nothing in `npm run check` can see a Graph
 * call, which makes these the only guard on that.
 */

const listCommentablePosts = vi.fn()
const fetchMediaComments = vi.fn()

/**
 * The sync now asks a comments ADAPTER, resolved from the connection's platform, rather than a
 * module named after one network. The spy stands in for that adapter's read; the rest of the
 * contract is present because the sync resolves the whole adapter, not one method.
 */
vi.mock('@/lib/meta/networks', () => ({
  resolveComments: () => ({
    platform: 'instagram',
    label: 'Instagram',
    listCommentablePosts: (...a: unknown[]) => listCommentablePosts(...a),
    fetchComments: (...a: unknown[]) => fetchMediaComments(...a),
    reply: vi.fn(),
    setHidden: vi.fn(),
    remove: vi.fn(),
  }),
  COMMENTABLE_PLATFORMS: ['instagram', 'facebook'],
}))
vi.mock('@/lib/queries/posts-by-media-id', () => ({
  fetchPostIdsByMediaId: async () => new Map([['media-1', 'post-1']]),
}))

const upsertPostMetricRows = vi.fn()
vi.mock('@/features/analytics/lib/post-metrics-store', () => ({
  upsertPostMetricRows: (...a: unknown[]) => upsertPostMetricRows(...a),
}))

const { syncClientComments } = await import('../lib/sync-comments')
const { GraphApiError } = await import('@/lib/meta/graph-errors')

/**
 * A Supabase stand-in that records what was asked of `platform_comments`.
 *
 * `storedIds` seeds the rows the count comparison reads back, which is the only
 * database state any of these assertions depends on.
 */
function fakeAdmin(storedByMedia: Record<string, string[]> = {}) {
  // Args declared so `upsert.mock.calls[0][0]` is the rows, not an empty tuple.
  const upsert = vi.fn(async (_rows: Array<Record<string, unknown>>, _options?: unknown) => ({
    error: null,
  }))
  const deleted: string[][] = []
  const del = vi.fn(() => ({
    in: (_column: string, ids: string[]) => {
      deleted.push(ids)
      return Promise.resolve({ error: null })
    },
    lt: () => Promise.resolve({ error: null }),
  }))

  const select = vi.fn((columns: string) => ({
    eq: () => ({
      eq: () => ({
        in: (_column: string, mediaIds: string[]) => {
          const rows = mediaIds.flatMap((mediaId) =>
            (storedByMedia[mediaId] ?? []).map((id) =>
              columns === 'id' ? { id } : { external_post_id: mediaId }
            )
          )
          return Promise.resolve({ data: rows, error: null })
        },
      }),
    }),
  }))

  const client = {
    from: vi.fn(() => ({ select, upsert, delete: del })),
  } as unknown as SupabaseClient
  return { client, upsert, deleted }
}

/** The identity fields Instagram's adapter supplies; Facebook's returns null instead. */
const IDENTITY = {
  caption: 'x',
  permalink: null,
  thumbnailUrl: null,
  mediaType: null,
  mediaProductType: null,
  postedAt: null,
}

const CONNECTION = {
  clientId: 'client-1',
  platform: 'instagram',
  accountId: 'acct-1',
  accessToken: 'tok',
}

beforeEach(() => {
  listCommentablePosts.mockReset()
  fetchMediaComments.mockReset()
  upsertPostMetricRows.mockReset()
})

describe('media identity', () => {
  it('records what a commented post IS, even when its comments have not changed', async () => {
    // The queue renders the post a comment sits under, and read that only from what
    // the NIGHTLY sync wrote. So a post commented on this morning showed as an
    // untitled grey box until 03:30, and a post never published from Kontuur showed
    // as nothing at all — which on a live account was 18 of 20 media.
    listCommentablePosts.mockResolvedValue([
      {
        externalPostId: 'media-1',
        commentCount: 2,
        identity: {
          caption: 'A link in your LinkedIn post body',
          permalink: 'https://instagram.com/p/abc',
          thumbnailUrl: 'https://cdn/thumb.jpg',
          mediaType: null,
          mediaProductType: null,
          postedAt: '2026-08-19T10:00:00Z',
        },
      },
    ])
    const { client } = fakeAdmin({ 'media-1': ['c1', 'c2'] })

    await syncClientComments(client, CONNECTION)

    // Unchanged, so no comment call — but the identity is recorded anyway.
    expect(fetchMediaComments).not.toHaveBeenCalled()
    const [, rows] = upsertPostMetricRows.mock.calls[0] as [unknown, Array<Record<string, unknown>>]
    expect(rows[0]).toMatchObject({
      platform: 'instagram',
      external_post_id: 'media-1',
      post_id: 'post-1',
      caption: 'A link in your LinkedIn post body',
      permalink: 'https://instagram.com/p/abc',
      thumbnail_url: 'https://cdn/thumb.jpg',
    })
  })

  it('never writes the measurement columns', async () => {
    listCommentablePosts.mockResolvedValue([
      { externalPostId: 'media-1', commentCount: 1, identity: IDENTITY },
    ])
    fetchMediaComments.mockResolvedValue({
      comments: [{ id: 'c1' }],
      withheld: false,
      nextCursor: null,
    })
    const { client } = fakeAdmin()

    await syncClientComments(client, CONNECTION)

    // Reach, views and the rest belong to the nightly job. A zero written here is
    // indistinguishable from a measured zero on the analytics page — and this sync
    // has measured nothing.
    const [, rows] = upsertPostMetricRows.mock.calls[0] as [unknown, Array<Record<string, unknown>>]
    for (const column of ['reach', 'views', 'comments_count', 'like_count', 'total_interactions']) {
      expect(rows[0]).not.toHaveProperty(column)
    }
  })
})

describe('syncClientComments', () => {
  it('makes no comment call when the stored count already matches', async () => {
    listCommentablePosts.mockResolvedValue([
      { externalPostId: 'media-1', commentCount: 2, identity: IDENTITY },
    ])
    const { client } = fakeAdmin({ 'media-1': ['c1', 'c2'] })

    const result = await syncClientComments(client, CONNECTION)

    // The entire economics of the feature. Two stored, two reported, nothing fetched.
    expect(fetchMediaComments).not.toHaveBeenCalled()
    expect(result).toEqual({ unchanged: 1, fetched: 0 })
  })

  it('fetches when the count has risen', async () => {
    listCommentablePosts.mockResolvedValue([
      { externalPostId: 'media-1', commentCount: 3, identity: IDENTITY },
    ])
    fetchMediaComments.mockResolvedValue({
      comments: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
      withheld: false,
      nextCursor: null,
    })
    const { client, upsert } = fakeAdmin({ 'media-1': ['c1', 'c2'] })

    const result = await syncClientComments(client, CONNECTION)

    expect(fetchMediaComments).toHaveBeenCalledOnce()
    expect(result).toEqual({ unchanged: 0, fetched: 1 })
    expect(upsert).toHaveBeenCalledOnce()
  })

  it('skips posts with no comments at all without asking Instagram', async () => {
    listCommentablePosts.mockResolvedValue([
      { externalPostId: 'media-1', commentCount: 0, identity: IDENTITY },
      { externalPostId: 'media-2', commentCount: 0, identity: IDENTITY },
    ])
    const { client } = fakeAdmin()

    expect(await syncClientComments(client, CONNECTION)).toEqual({ unchanged: 0, fetched: 0 })
    expect(fetchMediaComments).not.toHaveBeenCalled()
  })

  it('follows the cursor — fetchMediaComments returns one page, not all of them', async () => {
    listCommentablePosts.mockResolvedValue([
      { externalPostId: 'media-1', commentCount: 2, identity: IDENTITY },
    ])
    fetchMediaComments
      .mockResolvedValueOnce({ comments: [{ id: 'c1' }], withheld: false, nextCursor: 'page-2' })
      .mockResolvedValueOnce({ comments: [{ id: 'c2' }], withheld: false, nextCursor: null })
    const { client, upsert } = fakeAdmin()

    await syncClientComments(client, CONNECTION)

    // A caller that ignored the cursor would silently cap every busy post at 50.
    expect(fetchMediaComments).toHaveBeenCalledTimes(2)
    expect(upsert.mock.calls[0]![0]).toHaveLength(2)
  })

  it('stores nothing and stops when Instagram withholds the comments', async () => {
    // Standard Access: HTTP 200, empty array, a truthful comments_count. Nothing
    // throws, so only the flag distinguishes this from a quiet post.
    listCommentablePosts.mockResolvedValue([
      { externalPostId: 'media-1', commentCount: 4, identity: IDENTITY },
    ])
    fetchMediaComments.mockResolvedValue({ comments: [], withheld: true, nextCursor: 'page-2' })
    const { client, upsert } = fakeAdmin()

    await syncClientComments(client, CONNECTION)

    expect(fetchMediaComments).toHaveBeenCalledOnce()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('stores replies as rows carrying parent_id', async () => {
    listCommentablePosts.mockResolvedValue([
      { externalPostId: 'media-1', commentCount: 1, identity: IDENTITY },
    ])
    fetchMediaComments.mockResolvedValue({
      // Flat, each naming the comment it answers: nesting is the NETWORK's shape, and the
      // adapter resolves it before the sync ever sees it. Instagram nests replies in one
      // response and Facebook keeps them on a second edge; neither reaches here.
      comments: [
        { id: 'c1', parentId: null, text: 'A question', authorName: 'maria.kx' },
        { id: 'r1', parentId: 'c1', text: 'An answer', authorName: 'haelanclinic' },
      ],
      withheld: false,
      nextCursor: null,
    })
    const { client, upsert } = fakeAdmin()

    await syncClientComments(client, CONNECTION)

    // "Have we answered this" is a question about rows we already hold, which only
    // works if replies are rows.
    const rows = upsert.mock.calls[0]![0]
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ id: 'c1', parent_id: null })
    expect(rows[1]).toMatchObject({ id: 'r1', parent_id: 'c1', author_username: 'haelanclinic' })
  })

  it('records the post a comment sits under, so the read never resolves media ids', async () => {
    listCommentablePosts.mockResolvedValue([
      { externalPostId: 'media-1', commentCount: 1, identity: IDENTITY },
    ])
    fetchMediaComments.mockResolvedValue({
      comments: [{ id: 'c1' }],
      withheld: false,
      nextCursor: null,
    })
    const { client, upsert } = fakeAdmin()

    await syncClientComments(client, CONNECTION)

    const rows = upsert.mock.calls[0]![0]
    expect(rows[0]).toMatchObject({
      post_id: 'post-1',
      platform: 'instagram',
      platform_account_id: 'acct-1',
    })
  })

  it('deletes rows Instagram no longer returns for a refetched post', async () => {
    listCommentablePosts.mockResolvedValue([
      { externalPostId: 'media-1', commentCount: 1, identity: IDENTITY },
    ])
    fetchMediaComments.mockResolvedValue({
      comments: [{ id: 'c1' }],
      withheld: false,
      nextCursor: null,
    })
    const { client, deleted } = fakeAdmin({ 'media-1': ['c1', 'c2'] })

    await syncClientComments(client, CONNECTION)

    // c2 was deleted by its author upstream. c1 survives.
    expect(deleted).toContainEqual(['c2'])
  })

  it('stores a withheld comment as nulls rather than dropping it', async () => {
    listCommentablePosts.mockResolvedValue([
      { externalPostId: 'media-1', commentCount: 1, identity: IDENTITY },
    ])
    // What the Instagram adapter actually produces from `{ id: 'c1' }` — the id alone, every
    // other field explicitly null. That mapping is pinned in the adapter's own suite; this
    // asserts the row it becomes.
    fetchMediaComments.mockResolvedValue({
      comments: [
        {
          id: 'c1',
          parentId: null,
          authorName: null,
          text: null,
          hidden: false,
          canHide: true,
          likeCount: null,
          commentedAt: null,
        },
      ],
      withheld: false,
      nextCursor: null,
    })
    const { client, upsert } = fakeAdmin()

    await syncClientComments(client, CONNECTION)

    // Null, not undefined and not a crash: a NOT NULL column here would turn a
    // permissions state into a failed sync.
    const rows = upsert.mock.calls[0]![0]
    expect(rows[0]).toMatchObject({ text: null, author_username: null, hidden: false })
  })

  it('lets a rate limit propagate, so the run can stop rather than keep asking', async () => {
    // Code 4 classifies as rate_limited, which is what syncAllClientComments breaks
    // the whole run on — one 429 poisons every remaining call against a per-app quota.
    const rateLimited = new GraphApiError({
      httpStatus: 400,
      code: 4,
      subcode: null,
      type: 'OAuthException',
      message: 'Application request limit reached',
      fbtraceId: null,
    })
    listCommentablePosts.mockRejectedValue(rateLimited)
    const { client } = fakeAdmin()

    await expect(syncClientComments(client, CONNECTION)).rejects.toThrow(
      'Application request limit reached'
    )
    expect(rateLimited.failure).toBe('rate_limited')
  })
})

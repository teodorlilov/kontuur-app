import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The half-hourly sync.
 *
 * The behaviour worth pinning is what it does NOT do. A comments queue that
 * refetched every post on every run would spend the Graph quota the publish cron shares, every
 * half hour, so the whole design rests on the count comparison
 * skipping posts that have not changed. Nothing in `npm run check` can see a Graph
 * call, which makes these the only guard on that.
 */

const listCommentablePosts = vi.fn()
const fetchMediaComments = vi.fn()

/**
 * The sync now asks a comments ADAPTER, resolved from the connection's platform, rather than a
 * module named after one network. The spy stands in for that adapter's read; the rest of the
 * contract is present because the sync resolves the whole adapter, not one method.
 * `flags.countIsExact` stays true except in the one case that flips it and restores it.
 */
const flags = vi.hoisted(() => ({ countIsExact: true }))

vi.mock('@/lib/meta/networks', () => ({
  resolveComments: () => ({
    platform: 'instagram',
    label: 'Instagram',
    countIsExact: flags.countIsExact,
    listCommentablePosts: (...a: unknown[]) => listCommentablePosts(...a),
    fetchComments: (...a: unknown[]) => fetchMediaComments(...a),
    reply: vi.fn(),
    setHidden: vi.fn(),
    remove: vi.fn(),
  }),
  COMMENTABLE_PLATFORMS: ['instagram', 'facebook', 'registry-only'],
}))
vi.mock('@/lib/queries/posts-by-media-id', () => ({
  fetchPostIdsByMediaId: async () => new Map([['media-1', 'post-1']]),
}))

const upsertPostMetricRows = vi.fn()
// The import() form, not a bare string: this reaches into another feature, so its path moves when
// that feature is rearranged — and a vi.mock path that stops resolving is a SILENT no-op. tsc
// checks this one; the sibling import in sync-comments.ts would not have covered it.
vi.mock(import('@/features/analytics/lib/shared/post-metrics-store'), () => ({
  upsertPostMetricRows: (...a: unknown[]) => upsertPostMetricRows(...a),
}))

const retireConnection = vi.fn()
vi.mock('@/lib/meta/connection-store', () => ({
  retireConnection: (...a: unknown[]) => retireConnection(...a),
}))

const { syncClientComments, syncAllClientComments } = await import('../lib/sync-comments')
const { GraphApiError } = await import('@/lib/meta/graph-errors')

/**
 * A Supabase stand-in that records what was asked of `platform_comments`.
 *
 * `storedByMedia` seeds the rows the count comparison reads back, which is the only
 * database state any of these assertions depends on. `upsert` declares its args so
 * `upsert.mock.calls[0][0]` is the rows, not an empty tuple.
 */
function fakeAdmin(storedByMedia: Record<string, string[]> = {}) {
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

/** A post identity as an adapter reports one; no case checks its values (the identity case builds its own). */
const IDENTITY = {
  caption: 'x',
  permalink: null,
  thumbnailUrl: null,
  mediaType: null,
  mediaProductType: null,
  postedAt: null,
}

/**
 * What the Instagram adapter makes of a comment whose text and author were withheld: the id alone,
 * `hidden` false, every other field null — pinned in
 * src/lib/meta/networks/__tests__/instagram-comments.test.ts; this suite checks the row it becomes.
 */
const WITHHELD_COMMENT = {
  id: 'c1',
  parentId: null,
  authorName: null,
  text: null,
  hidden: false,
  likeCount: null,
  commentedAt: null,
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
  it('records what a commented post IS even when its comments are unchanged, so the queue need not wait for the nightly sync', async () => {
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

  it('never writes the measurement columns — a zero here would read as a measured zero on the analytics page', async () => {
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

  it('follows the cursor — fetchMediaComments returns one page, so ignoring it would cap a busy post at 50', async () => {
    listCommentablePosts.mockResolvedValue([
      { externalPostId: 'media-1', commentCount: 2, identity: IDENTITY },
    ])
    fetchMediaComments
      .mockResolvedValueOnce({ comments: [{ id: 'c1' }], withheld: false, nextCursor: 'page-2' })
      .mockResolvedValueOnce({ comments: [{ id: 'c2' }], withheld: false, nextCursor: null })
    const { client, upsert } = fakeAdmin()

    await syncClientComments(client, CONNECTION)

    expect(fetchMediaComments).toHaveBeenCalledTimes(2)
    expect(upsert.mock.calls[0]![0]).toHaveLength(2)
  })

  it('stores nothing and stops when Instagram withholds the comments — an empty 200 only the withheld flag tells apart from a quiet post', async () => {
    listCommentablePosts.mockResolvedValue([
      { externalPostId: 'media-1', commentCount: 4, identity: IDENTITY },
    ])
    fetchMediaComments.mockResolvedValue({ comments: [], withheld: true, nextCursor: 'page-2' })
    const { client, upsert } = fakeAdmin()

    await syncClientComments(client, CONNECTION)

    expect(fetchMediaComments).toHaveBeenCalledOnce()
    expect(upsert).not.toHaveBeenCalled()
  })

  it("stores the adapter's flat replies as rows carrying parent_id, so whether we answered is read from stored rows", async () => {
    listCommentablePosts.mockResolvedValue([
      { externalPostId: 'media-1', commentCount: 1, identity: IDENTITY },
    ])
    fetchMediaComments.mockResolvedValue({
      comments: [
        { id: 'c1', parentId: null, text: 'A question', authorName: 'maria.kx' },
        { id: 'r1', parentId: 'c1', text: 'An answer', authorName: 'haelanclinic' },
      ],
      withheld: false,
      nextCursor: null,
    })
    const { client, upsert } = fakeAdmin()

    await syncClientComments(client, CONNECTION)

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

  it("fetches an equal-count post anyway when the network's tally is not exact, and deletes the comment that vanished", async () => {
    flags.countIsExact = false
    try {
      listCommentablePosts.mockResolvedValue([
        { externalPostId: 'media-1', commentCount: 1, identity: IDENTITY },
      ])
      fetchMediaComments.mockResolvedValue({
        comments: [{ id: 'c-new' }],
        withheld: false,
        nextCursor: null,
      })
      const { client, deleted } = fakeAdmin({ 'media-1': ['c-old'] })

      const outcome = await syncClientComments(client, CONNECTION)

      expect(fetchMediaComments).toHaveBeenCalled()
      expect(outcome.fetched).toBe(1)
      expect(deleted).toContainEqual(['c-old'])
    } finally {
      flags.countIsExact = true
    }
  })

  it('refetches a post whose count fell to zero, so deleted comments leave the queue', async () => {
    listCommentablePosts.mockResolvedValue([
      { externalPostId: 'media-1', commentCount: 0, identity: IDENTITY },
    ])
    fetchMediaComments.mockResolvedValue({ comments: [], withheld: false, nextCursor: null })
    const { client, deleted } = fakeAdmin({ 'media-1': ['c1'] })

    const outcome = await syncClientComments(client, CONNECTION)

    expect(outcome.fetched).toBe(1)
    expect(deleted).toContainEqual(['c1'])
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

    expect(deleted).toContainEqual(['c2'])
  })

  it('stores a withheld comment as nulls rather than dropping it — a NOT NULL column would turn a permission gap into a failed sync', async () => {
    listCommentablePosts.mockResolvedValue([
      { externalPostId: 'media-1', commentCount: 1, identity: IDENTITY },
    ])
    fetchMediaComments.mockResolvedValue({
      comments: [WITHHELD_COMMENT],
      withheld: false,
      nextCursor: null,
    })
    const { client, upsert } = fakeAdmin()

    await syncClientComments(client, CONNECTION)

    const rows = upsert.mock.calls[0]![0]
    expect(rows[0]).toMatchObject({ text: null, author_username: null, hidden: false })
  })

  it('lets a rate limit (Graph code 4) propagate, so the run can stop rather than keep spending the per-app quota', async () => {
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

const LIVE_CONNECTION = {
  client_id: 'c1',
  platform: 'instagram',
  account_id: 'acct',
  access_token: 'tok',
}

/**
 * A Supabase stand-in answering the roster read with `roster`, and the retention sweep. The
 * roster's platform filter is recorded for the test.
 */
function fakeRosterAdmin(roster: Array<{ client_id: string | null }>) {
  const platformFilter = vi.fn((_column: string, _values: readonly string[]) => ({
    not: () => ({
      not: () => Promise.resolve({ data: roster, error: null }),
    }),
  }))
  const select = vi.fn(() => ({ in: platformFilter }))
  const del = vi.fn(() => ({ lt: () => Promise.resolve({ error: null }) }))
  const client = { from: vi.fn(() => ({ select, delete: del })) } as unknown as SupabaseClient
  return { client, platformFilter }
}

describe('syncAllClientComments on a dead token', () => {
  it('retires the connection the moment Graph answers 190 — this run is the half-hourly heartbeat', async () => {
    retireConnection.mockReset()
    retireConnection.mockResolvedValue(undefined)
    listCommentablePosts.mockRejectedValue(
      new GraphApiError({
        httpStatus: 400,
        code: 190,
        subcode: null,
        type: 'OAuthException',
        message: 'Error validating access token',
        fbtraceId: null,
      })
    )
    const { client: admin } = fakeRosterAdmin([LIVE_CONNECTION])

    const outcome = await syncAllClientComments(admin, {
      timeBudgetMs: 10_000,
      entitledClientIds: new Set(['c1']),
    })

    expect(outcome.failed).toBe(1)
    expect(retireConnection).toHaveBeenCalledWith(admin, {
      clientId: 'c1',
      platform: 'instagram',
      reason: 'Error validating access token',
    })
  })
})

describe('syncAllClientComments and its roster', () => {
  it('skips a connection with no client, counting it with the entitlement skips, not as a failure', async () => {
    listCommentablePosts.mockResolvedValue([])
    const { client: admin } = fakeRosterAdmin([
      { ...LIVE_CONNECTION, client_id: null },
      LIVE_CONNECTION,
    ])

    const outcome = await syncAllClientComments(admin, {
      timeBudgetMs: 10_000,
      entitledClientIds: new Set(['c1']),
    })

    expect(listCommentablePosts).toHaveBeenCalledTimes(1)
    expect(outcome).toMatchObject({ synced: 1, skipped: 1, failed: 0, errors: [] })
  })

  it('reads the networks the comments registry lists — a network only the registry knows included', async () => {
    listCommentablePosts.mockResolvedValue([])
    const { client: admin, platformFilter } = fakeRosterAdmin([LIVE_CONNECTION])

    await syncAllClientComments(admin, {
      timeBudgetMs: 10_000,
      entitledClientIds: new Set(['c1']),
    })

    expect(platformFilter).toHaveBeenCalledWith('platform', [
      'instagram',
      'facebook',
      'registry-only',
    ])
  })
})

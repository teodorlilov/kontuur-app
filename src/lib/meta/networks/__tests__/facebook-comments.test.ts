import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * A Page's comments, behind the shared contract.
 *
 * Every shape here was probed against a real visitor comment rather than read from the
 * reference, and the two facts most likely to be got wrong by inference are the ones asserted
 * hardest: replies are NOT on the post's own edge, and `can_hide` is per comment — Facebook
 * refuses to hide a Page's own comment and says so before the attempt.
 */

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const { facebookComments } = await import('../facebook-comments')

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body, headers: new Headers() }
}

const ACCOUNT = { accountId: '723701000827665', accessToken: 'page-tok' }
const POST = '723701000827665_122167637282960180'

/** What an absent identity field maps to — null, never missing. */
const EMPTY_IDENTITY = {
  caption: null,
  permalink: null,
  thumbnailUrl: null,
  mediaType: null,
  mediaProductType: null,
  postedAt: null,
}
const THEIRS = '122167637282960180_1386857980259623'

/**
 * Route by URL, because the reply read is a SECOND call this adapter makes on its own.
 *
 * Decoded first: the client builds its query through URLSearchParams, so a field list arrives
 * percent-encoded. And an argument-less call is tolerated — the runner invokes a stubbed global
 * with none, which is not something the adapter did.
 */
function graph(routes: Array<[string, unknown]>) {
  fetchMock.mockImplementation((url: unknown) => {
    if (url === undefined) return Promise.resolve(ok({ data: [] }))
    const target = decodeURIComponent(String(url))
    const hit = routes.find(([fragment]) => target.includes(fragment))
    if (!hit) throw new Error(`unrouted graph call: ${target}`)
    return Promise.resolve(ok(hit[1]))
  })
}

/** The calls the ADAPTER made, ignoring any the runner adds. */
function graphCalls(): string[] {
  return fetchMock.mock.calls
    .filter((call) => call[0] !== undefined)
    .map((call) => decodeURIComponent(String(call[0])))
}

/** The JSON body of the adapter's first write. */
function sentBody(): unknown {
  const call = fetchMock.mock.calls.find((entry) => entry[1]?.body)
  return JSON.parse(String(call?.[1]?.body))
}

beforeEach(() => fetchMock.mockReset())

describe('listCommentablePosts', () => {
  it('reads the tally without the bodies', async () => {
    graph([
      [
        'published_posts',
        {
          data: [
            {
              id: POST,
              created_time: '2026-08-24T14:28:34+0000',
              comments: { summary: { total_count: 3 } },
            },
            {
              id: 'p2',
              created_time: '2026-08-19T09:23:47+0000',
              comments: { summary: { total_count: 0 } },
            },
          ],
        },
      ],
    ])

    const posts = await facebookComments.listCommentablePosts({
      account: ACCOUNT,
      since: '2026-08-01T00:00:00.000Z',
    })

    expect(posts).toEqual([
      {
        externalPostId: POST,
        commentCount: 3,
        identity: { ...EMPTY_IDENTITY, postedAt: '2026-08-24T14:28:34+0000' },
      },
      {
        externalPostId: 'p2',
        commentCount: 0,
        identity: { ...EMPTY_IDENTITY, postedAt: '2026-08-19T09:23:47+0000' },
      },
    ])
    // `limit(0)` is what keeps this one call rather than one per post.
    expect(graphCalls()[0]).toContain('comments.summary(true).limit(0)')
  })

  it('carries the identity the queue renders above a conversation', async () => {
    // On the same call, so caption, link and picture cost nothing extra. Without them a Page
    // post showed as an untitled grey box with no link — the state that made this worth a
    // migration rather than a shrug.
    graph([
      [
        'published_posts',
        {
          data: [
            {
              id: POST,
              message: 'As your digital strategists',
              permalink_url: 'https://www.facebook.com/122/posts/456',
              full_picture: 'https://cdn/fb.jpg',
              created_time: '2026-08-24T14:28:34+0000',
              comments: { summary: { total_count: 1 } },
            },
          ],
        },
      ],
    ])

    const [post] = await facebookComments.listCommentablePosts({
      account: ACCOUNT,
      since: '2026-08-01T00:00:00.000Z',
    })

    expect(post?.identity).toEqual({
      caption: 'As your digital strategists',
      permalink: 'https://www.facebook.com/122/posts/456',
      thumbnailUrl: 'https://cdn/fb.jpg',
      // No Facebook equivalent on this edge; a guess here reaches the analytics page.
      mediaType: null,
      mediaProductType: null,
      postedAt: '2026-08-24T14:28:34+0000',
    })
  })
})

describe('fetchComments', () => {
  it('follows replies onto their own edge, and stamps each with its parent', async () => {
    // The structural difference from Instagram, which nests replies in the same response. A
    // reply is reachable ONLY at /{comment-id}/comments, so a single-call adapter would store
    // the parent and silently lose every answer under it.
    graph([
      [
        `${THEIRS}/comments`,
        {
          data: [{ id: 'reply-1', message: 'glad you like', from: { name: 'About Social Media' } }],
        },
      ],
      [
        `${POST}/comments`,
        {
          data: [
            {
              id: THEIRS,
              message: 'cool',
              from: { name: 'Teodor Lilov' },
              created_time: '2026-09-05T14:33:01+0000',
              like_count: 0,
              comment_count: 1,
              can_hide: true,
              is_hidden: false,
            },
          ],
        },
      ],
    ])

    const result = await facebookComments.fetchComments({
      account: ACCOUNT,
      externalPostId: POST,
      expectedCount: 1,
    })

    expect(result.comments).toEqual([
      {
        id: THEIRS,
        parentId: null,
        authorName: 'Teodor Lilov',
        text: 'cool',
        hidden: false,
        canHide: true,
        likeCount: 0,
        commentedAt: '2026-09-05T14:33:01+0000',
      },
      {
        id: 'reply-1',
        parentId: THEIRS,
        authorName: 'About Social Media',
        text: 'glad you like',
        hidden: false,
        // Absent in the response: unknown must not read as allowed.
        canHide: false,
        likeCount: null,
        commentedAt: null,
      },
    ])
  })

  it('does not chase replies for a comment that has none', async () => {
    // `comment_count` is why the reply reads are cheap; without the filter this would be one
    // extra round trip per comment on every sync.
    graph([[`${POST}/comments`, { data: [{ id: THEIRS, message: 'cool', comment_count: 0 }] }]])

    await facebookComments.fetchComments({
      account: ACCOUNT,
      externalPostId: POST,
      expectedCount: 1,
    })

    expect(graphCalls()).toHaveLength(1)
  })

  it('reports an empty first page against a non-zero count as withheld', async () => {
    graph([[`${POST}/comments`, { data: [] }]])

    const result = await facebookComments.fetchComments({
      account: ACCOUNT,
      externalPostId: POST,
      expectedCount: 4,
    })

    expect(result.withheld).toBe(true)
  })

  it('does not call a later empty page withheld — that is the end of the list', async () => {
    graph([[`${POST}/comments`, { data: [] }]])

    const result = await facebookComments.fetchComments({
      account: ACCOUNT,
      externalPostId: POST,
      expectedCount: 4,
      after: 'cursor-2',
    })

    expect(result.withheld).toBe(false)
  })
})

describe('moderation', () => {
  it('replies on the comment edge, so the answer threads under it', async () => {
    graph([[`${THEIRS}/comments`, { id: 'new-reply' }]])

    const id = await facebookComments.reply({
      account: ACCOUNT,
      commentId: THEIRS,
      message: 'thanks!',
    })

    expect(id).toBe('new-reply')
    expect(sentBody()).toEqual({ message: 'thanks!' })
  })

  it('hides through the body, where Instagram uses a query parameter', async () => {
    graph([[THEIRS, { success: true }]])

    await facebookComments.setHidden({ account: ACCOUNT, commentId: THEIRS, hidden: true })

    expect(sentBody()).toEqual({ is_hidden: true })
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Reading and moderating comments.
 *
 * The case that matters most is `withheld`. With Standard (development) Access, Instagram answers
 * `/{media}/comments` with HTTP 200 and an empty `data` array — no error, no warning — while the
 * media's own `comments_count` reads correctly. It withholds the body and author of comments
 * written by the general public until the app has Advanced Access for
 * `instagram_business_manage_comments`.
 *
 * That was established against a live account, and it is the single behaviour most likely to be
 * mistaken for a broken feature. Nothing throws, so only the count comparison can tell "this post
 * has no comments" from "Instagram would not give them to us".
 */

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const { instagramComments } = await import('../instagram-comments')

/** The credentials every adapter call takes; the account id is unused by this edge. */
const ACCOUNT = { accountId: 'ig-account', accessToken: 'tok' }

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    headers: new Headers(),
  }
}

beforeEach(() => {
  fetchMock.mockReset()
})

/** The request the module actually issued. */
function lastCall(): { url: URL; init: RequestInit } {
  const [target, init] = fetchMock.mock.calls.at(-1)!
  return { url: target instanceof URL ? target : new URL(String(target)), init }
}

describe('fetchComments', () => {
  it('reports withheld when the post has comments and the edge returns none', async () => {
    fetchMock.mockResolvedValue(ok({ data: [] }))

    const result = await instagramComments.fetchComments({
      account: ACCOUNT,
      externalPostId: 'media-1',
      expectedCount: 2,
    })

    // The whole point: 200 + empty + a non-zero count is a PERMISSIONS state, not an empty post.
    expect(result.withheld).toBe(true)
    expect(result.comments).toEqual([])
  })

  it('does not report withheld for a post that genuinely has no comments', async () => {
    fetchMock.mockResolvedValue(ok({ data: [] }))

    expect(
      (
        await instagramComments.fetchComments({
          account: ACCOUNT,
          externalPostId: 'media-1',
          expectedCount: 0,
        })
      ).withheld
    ).toBe(false)
  })

  it('does not report withheld once comments come back', async () => {
    fetchMock.mockResolvedValue(ok({ data: [{ id: 'c1', text: 'hi', username: 'someone' }] }))

    const result = await instagramComments.fetchComments({
      account: ACCOUNT,
      externalPostId: 'media-1',
      expectedCount: 2,
    })

    expect(result.withheld).toBe(false)
    expect(result.comments[0]?.text).toBe('hi')
  })

  it('does not report withheld on a later page — an empty page is the end of the list', async () => {
    fetchMock.mockResolvedValue(ok({ data: [] }))

    expect(
      (
        await instagramComments.fetchComments({
          account: ACCOUNT,
          externalPostId: 'media-1',
          expectedCount: 2,
          after: 'cursor-abc',
        })
      ).withheld
    ).toBe(false)
  })

  it('parses a comment whose text and author were withheld', async () => {
    // Instagram can return the id alone. A schema requiring text would turn that into a crash.
    fetchMock.mockResolvedValue(ok({ data: [{ id: 'c1' }] }))

    const result = await instagramComments.fetchComments({
      account: ACCOUNT,
      externalPostId: 'media-1',
      expectedCount: 1,
    })

    // Mapped into the queue's vocabulary with every absent field null — not dropped, and not
    // left as Instagram's own shape, which is what the queue would then have to understand.
    expect(result.comments).toEqual([
      {
        id: 'c1',
        parentId: null,
        authorName: null,
        text: null,
        hidden: false,
        // Instagram offers no per-comment flag, so hiding is always allowed on its own media.
        canHide: true,
        likeCount: null,
        commentedAt: null,
      },
    ])
  })

  it('carries the paging cursor', async () => {
    fetchMock.mockResolvedValue(ok({ data: [], paging: { cursors: { after: 'next-page' } } }))

    expect(
      (
        await instagramComments.fetchComments({
          account: ACCOUNT,
          externalPostId: 'media-1',
          expectedCount: 0,
        })
      ).nextCursor
    ).toBe('next-page')
  })
})

describe('moderation', () => {
  it('replies on the comment, not the media — otherwise it is a new top-level comment', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'reply-1' }))

    const id = await instagramComments.reply({
      account: ACCOUNT,
      commentId: 'comment-1',
      message: 'thanks!',
    })

    expect(id).toBe('reply-1')
    expect(lastCall().url.pathname).toMatch(/\/comment-1\/replies$/)
    expect(lastCall().init.method).toBe('POST')
  })

  it('hides through a query parameter, which is where Instagram reads it', async () => {
    fetchMock.mockResolvedValue(ok({ success: true }))

    await instagramComments.setHidden({ account: ACCOUNT, commentId: 'comment-1', hidden: true })

    expect(lastCall().url.searchParams.get('hide')).toBe('true')
  })

  it('unhides with the same call', async () => {
    fetchMock.mockResolvedValue(ok({ success: true }))

    await instagramComments.setHidden({ account: ACCOUNT, commentId: 'comment-1', hidden: false })

    expect(lastCall().url.searchParams.get('hide')).toBe('false')
  })

  it('deletes with DELETE', async () => {
    fetchMock.mockResolvedValue(ok({ success: true }))

    await instagramComments.remove({ account: ACCOUNT, commentId: 'comment-1' })

    expect(lastCall().init.method).toBe('DELETE')
    expect(lastCall().url.pathname).toMatch(/\/comment-1$/)
  })
})

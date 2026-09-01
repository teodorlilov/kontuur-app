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

const { fetchMediaComments, replyToComment, setCommentHidden, deleteComment } =
  await import('../comments')

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

describe('fetchMediaComments', () => {
  it('reports withheld when the post has comments and the edge returns none', async () => {
    fetchMock.mockResolvedValue(ok({ data: [] }))

    const result = await fetchMediaComments('media-1', 'tok', 2)

    // The whole point: 200 + empty + a non-zero count is a PERMISSIONS state, not an empty post.
    expect(result.withheld).toBe(true)
    expect(result.comments).toEqual([])
  })

  it('does not report withheld for a post that genuinely has no comments', async () => {
    fetchMock.mockResolvedValue(ok({ data: [] }))

    expect((await fetchMediaComments('media-1', 'tok', 0)).withheld).toBe(false)
  })

  it('does not report withheld once comments come back', async () => {
    fetchMock.mockResolvedValue(ok({ data: [{ id: 'c1', text: 'hi', username: 'someone' }] }))

    const result = await fetchMediaComments('media-1', 'tok', 2)

    expect(result.withheld).toBe(false)
    expect(result.comments[0]?.text).toBe('hi')
  })

  it('does not report withheld on a later page — an empty page is the end of the list', async () => {
    fetchMock.mockResolvedValue(ok({ data: [] }))

    expect((await fetchMediaComments('media-1', 'tok', 2, 'cursor-abc')).withheld).toBe(false)
  })

  it('parses a comment whose text and author were withheld', async () => {
    // Instagram can return the id alone. A schema requiring text would turn that into a crash.
    fetchMock.mockResolvedValue(ok({ data: [{ id: 'c1' }] }))

    const result = await fetchMediaComments('media-1', 'tok', 1)

    expect(result.comments).toEqual([{ id: 'c1' }])
  })

  it('carries the paging cursor', async () => {
    fetchMock.mockResolvedValue(ok({ data: [], paging: { cursors: { after: 'next-page' } } }))

    expect((await fetchMediaComments('media-1', 'tok', 0)).nextCursor).toBe('next-page')
  })
})

describe('moderation', () => {
  it('replies on the comment, not the media — otherwise it is a new top-level comment', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'reply-1' }))

    const id = await replyToComment('comment-1', 'tok', 'thanks!')

    expect(id).toBe('reply-1')
    expect(lastCall().url.pathname).toMatch(/\/comment-1\/replies$/)
    expect(lastCall().init.method).toBe('POST')
  })

  it('hides through a query parameter, which is where Instagram reads it', async () => {
    fetchMock.mockResolvedValue(ok({ success: true }))

    await setCommentHidden('comment-1', 'tok', true)

    expect(lastCall().url.searchParams.get('hide')).toBe('true')
  })

  it('unhides with the same call', async () => {
    fetchMock.mockResolvedValue(ok({ success: true }))

    await setCommentHidden('comment-1', 'tok', false)

    expect(lastCall().url.searchParams.get('hide')).toBe('false')
  })

  it('deletes with DELETE', async () => {
    fetchMock.mockResolvedValue(ok({ success: true }))

    await deleteComment('comment-1', 'tok')

    expect(lastCall().init.method).toBe('DELETE')
    expect(lastCall().url.pathname).toMatch(/\/comment-1$/)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestApprovalEmail, requestApprovalLink } from '../request-approval'

/**
 * The one client-side approval request, previously written four times.
 *
 * Worth testing because the four copies disagreed about failure, and each disagreement
 * was invisible until the server actually failed: one read the response body before
 * checking `res.ok`, so a reply without JSON threw a SyntaxError instead of reporting
 * the error; one had no fallback message at all.
 */
/** Only the two members `request-approval` reads. */
type FakeResponse = { ok: boolean; json: () => Promise<unknown> }

function mockFetch(response: { ok: boolean; body?: unknown; throws?: boolean }) {
  // The signature is declared on `vi.fn`, not as unused parameters on the implementation:
  // without it `mock.calls` is an empty tuple and the assertions below cannot index it.
  const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<FakeResponse>>(async () => ({
    ok: response.ok,
    json: async () => {
      if (response.throws) throw new SyntaxError('Unexpected token < in JSON')
      return response.body
    },
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestApprovalLink', () => {
  it('posts the batch and returns the link', async () => {
    const fetchMock = mockFetch({ ok: true, body: { url: 'https://k/a/tok', postCount: 3 } })

    await expect(requestApprovalLink({ clientId: 'c1', weekStart: '2026-08-03' })).resolves.toEqual({
      url: 'https://k/a/tok',
      postCount: 3,
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/approval/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: 'c1', weekStart: '2026-08-03' }),
    })
  })

  it('takes an explicit post selection just as well as a week', async () => {
    // The body is `weekStart` XOR `postIds`, and the review queue sends the second form.
    const fetchMock = mockFetch({ ok: true, body: { url: 'u', postCount: 1 } })
    await requestApprovalLink({ clientId: 'c1', postIds: ['p1'] })

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ clientId: 'c1', postIds: ['p1'] }),
    })
  })

  it('throws the server’s own message', async () => {
    mockFetch({ ok: false, body: { error: 'No posts scheduled that week' } })

    await expect(requestApprovalLink({ clientId: 'c1', weekStart: '2026-08-03' })).rejects.toThrow(
      'No posts scheduled that week'
    )
  })

  it('throws a channel-specific fallback when the server says nothing', async () => {
    mockFetch({ ok: false, body: {} })

    await expect(requestApprovalLink({ clientId: 'c1', weekStart: '2026-08-03' })).rejects.toThrow(
      'Failed to generate approval link'
    )
  })

  it('survives a failure with no JSON body at all', async () => {
    // A 502 from the edge. One of the four copies parsed the body first and turned this
    // into a SyntaxError, which read to the user as an unrelated generic failure.
    mockFetch({ ok: false, throws: true })

    await expect(requestApprovalLink({ clientId: 'c1', weekStart: '2026-08-03' })).rejects.toThrow(
      'Failed to generate approval link'
    )
  })
})

describe('requestApprovalEmail', () => {
  it('posts to the email channel', async () => {
    const fetchMock = mockFetch({ ok: true, body: { postCount: 2 } })

    await expect(requestApprovalEmail({ clientId: 'c1', weekStart: '2026-08-03' })).resolves.toEqual(
      { postCount: 2 }
    )
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/approval/email')
  })

  it('falls back to its own wording, not the link channel’s', async () => {
    mockFetch({ ok: false, body: {} })

    await expect(requestApprovalEmail({ clientId: 'c1', weekStart: '2026-08-03' })).rejects.toThrow(
      'Failed to send approval email'
    )
  })
})

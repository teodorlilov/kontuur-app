import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestApprovalEmail, requestApprovalLink } from '../request-approval'

/**
 * The one client-side approval request, pinned on failure: a reply without JSON rejects with the
 * channel's own fallback, never a SyntaxError.
 */

/** Only the two members `request-approval` reads. */
type FakeResponse = { ok: boolean; json: () => Promise<unknown> }

/**
 * Stub the global `fetch` with one response. The signature is declared on `vi.fn`, not as unused
 * parameters on the implementation: without it `mock.calls` is an empty tuple the cases cannot index.
 */
function mockFetch(response: { ok: boolean; body?: unknown; throws?: boolean }) {
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

    await expect(requestApprovalLink({ clientId: 'c1', weekStart: '2026-08-03' })).resolves.toEqual(
      {
        url: 'https://k/a/tok',
        postCount: 3,
      }
    )
    expect(fetchMock).toHaveBeenCalledWith('/api/approval/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: 'c1', weekStart: '2026-08-03' }),
    })
  })

  it('takes an explicit post selection in place of a week, the form the review queue sends', async () => {
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

  it('throws the fallback when a success does not carry the link', async () => {
    mockFetch({ ok: true, body: { success: true } })

    await expect(requestApprovalLink({ clientId: 'c1', weekStart: '2026-08-03' })).rejects.toThrow(
      'Failed to generate approval link'
    )
  })

  it('throws the fallback, not a SyntaxError, for a failure with no JSON body, such as a 502 from the edge', async () => {
    mockFetch({ ok: false, throws: true })

    await expect(requestApprovalLink({ clientId: 'c1', weekStart: '2026-08-03' })).rejects.toThrow(
      'Failed to generate approval link'
    )
  })
})

describe('requestApprovalEmail', () => {
  it('posts to the email channel', async () => {
    const fetchMock = mockFetch({ ok: true, body: { postCount: 2 } })

    await expect(
      requestApprovalEmail({ clientId: 'c1', weekStart: '2026-08-03' })
    ).resolves.toEqual({ postCount: 2 })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/approval/email')
  })

  it('falls back to its own wording, not the link channel’s', async () => {
    mockFetch({ ok: false, body: {} })

    await expect(requestApprovalEmail({ clientId: 'c1', weekStart: '2026-08-03' })).rejects.toThrow(
      'Failed to send approval email'
    )
  })
})

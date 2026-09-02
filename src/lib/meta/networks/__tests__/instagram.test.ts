import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Instagram, as a network adapter.
 *
 * These exist because the publish path had NO test coverage when this logic moved
 * into it — not the preflight rules, not the container state machine, nothing. The
 * move was meant to be behaviour-neutral, and "the build is green" could not say
 * whether it was.
 *
 * The `resume` cases are the ones that matter most. Each container status means
 * something different for the row, and getting one wrong is either a duplicate
 * post or a post that silently never publishes.
 */

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const { instagramAdapter } = await import('../instagram')
const { resolveNetwork } = await import('../index')

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body, headers: new Headers() }
}

const ACCOUNT = { accountId: 'acct-1', accessToken: 'tok' }

function media(
  over: Partial<{ publicUrl: string; position: number; contentType: string | null }> = {}
) {
  return { publicUrl: 'https://cdn/1.jpg', position: 0, contentType: 'image/jpeg', ...over }
}

beforeEach(() => fetchMock.mockReset())

describe('resolveNetwork', () => {
  it('resolves Instagram from either vocabulary', () => {
    // posts store display case, connections store lowercase; the registry is the
    // one place that has to accept both.
    expect(resolveNetwork('instagram')?.platform).toBe('instagram')
    expect(resolveNetwork('Instagram')?.platform).toBe('instagram')
  })

  it('returns null for a network with no adapter', () => {
    // This is the entire "can we publish there" rule. A null here is what makes
    // the publish path fail the post instead of guessing.
    expect(resolveNetwork('facebook')).toBeNull()
    expect(resolveNetwork('linkedin')).toBeNull()
  })
})

describe('preflight', () => {
  it('passes a normal single image', () => {
    expect(instagramAdapter.preflight({ caption: 'hello', media: [media()] })).toBeNull()
  })

  it('blocks a post with no images, and lets it retry', () => {
    // Not final: images can still be attached.
    expect(instagramAdapter.preflight({ caption: 'hi', media: [] })).toEqual({
      message: 'No images attached',
      final: false,
    })
  })

  it('blocks an 11-image carousel for good', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => media({ position: i }))
    expect(instagramAdapter.preflight({ caption: 'hi', media: eleven })).toMatchObject({
      final: true,
    })
  })

  it('blocks a PNG for good, naming the slide', () => {
    // Instagram accepts JPEG only, and a PNG burns every attempt with an opaque
    // error — so this is final, and the message has to say which image.
    const blocker = instagramAdapter.preflight({
      caption: 'hi',
      media: [media(), media({ position: 1, contentType: 'image/png' })],
    })

    expect(blocker?.final).toBe(true)
    expect(blocker?.message).toContain('position 2')
  })

  it('allows an image whose type we never recorded', () => {
    // NULL means "we did not store a content type", not "wrong type". Failing
    // here would block every image uploaded before the column was populated.
    expect(
      instagramAdapter.preflight({ caption: 'hi', media: [media({ contentType: null })] })
    ).toBeNull()
  })

  it('blocks an over-long caption for good', () => {
    expect(
      instagramAdapter.preflight({ caption: 'x'.repeat(2201), media: [media()] })
    ).toMatchObject({ final: true })
  })
})

describe('publish', () => {
  it('hands back a container rather than waiting on it', async () => {
    // The whole reason the contract has `pending`: the caller persists this
    // reference BEFORE anything waits, so a dying run resumes it instead of
    // creating a second container and double-posting.
    fetchMock.mockResolvedValue(ok({ id: 'container-1' }))

    const result = await instagramAdapter.publish({
      account: ACCOUNT,
      payload: { caption: 'hello', media: [media()] },
    })

    expect(result).toEqual({ kind: 'pending', publishRef: 'container-1' })
  })

  it('builds a carousel from children, in position order', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'child-a' }))
      .mockResolvedValueOnce(ok({ id: 'child-b' }))
      .mockResolvedValueOnce(ok({ id: 'parent' }))

    const result = await instagramAdapter.publish({
      account: ACCOUNT,
      payload: {
        caption: 'hello',
        // Deliberately out of order: slides must publish in their own order, not
        // whatever order the query happened to return.
        media: [media({ position: 1, publicUrl: 'https://cdn/2.jpg' }), media({ position: 0 })],
      },
    })

    expect(result).toEqual({ kind: 'pending', publishRef: 'parent' })
    const firstChildUrl = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).image_url
    expect(firstChildUrl).toBe('https://cdn/1.jpg')
  })
})

describe('resume', () => {
  it('stays pending while the container is still processing', async () => {
    fetchMock.mockResolvedValue(ok({ status_code: 'IN_PROGRESS' }))

    expect(
      await instagramAdapter.resume({
        account: ACCOUNT,
        publishRef: 'c1',
        claimedAt: null,
        pollBudgetMs: 0,
      })
    ).toEqual({ kind: 'pending', publishRef: 'c1' })
  })

  it('publishes a finished container and returns its media id', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'media-9' }))

    expect(
      await instagramAdapter.resume({ account: ACCOUNT, publishRef: 'c1', claimedAt: null })
    ).toEqual({ kind: 'published', externalPostId: 'media-9' })
  })

  it('recovers the id when the container reports PUBLISHED without one', async () => {
    // The media is live but Instagram never handed back its id. The newest media
    // posted since this attempt was claimed is this post.
    fetchMock.mockResolvedValueOnce(ok({ status_code: 'PUBLISHED' })).mockResolvedValueOnce(
      ok({
        data: [
          { id: 'newer', timestamp: '2026-09-02T10:05:00Z' },
          { id: 'older', timestamp: '2026-09-02T09:00:00Z' },
        ],
      })
    )

    const result = await instagramAdapter.resume({
      account: ACCOUNT,
      publishRef: 'c1',
      claimedAt: new Date('2026-09-02T10:00:00Z').getTime(),
    })

    expect(result).toEqual({ kind: 'published', externalPostId: 'newer' })
  })

  it('claims no media that predates the attempt', async () => {
    // Guards against stamping an unrelated older post as this one's output.
    fetchMock
      .mockResolvedValueOnce(ok({ status_code: 'PUBLISHED' }))
      .mockResolvedValueOnce(ok({ data: [{ id: 'older', timestamp: '2026-09-02T09:00:00Z' }] }))

    expect(
      await instagramAdapter.resume({
        account: ACCOUNT,
        publishRef: 'c1',
        claimedAt: new Date('2026-09-02T10:00:00Z').getTime(),
      })
    ).toEqual({ kind: 'published', externalPostId: null })
  })

  it('rejects a dead container so the caller clears the reference', async () => {
    // ERROR/EXPIRED is the network answering normally with a "no" — not a thrown
    // error — so it comes back as `rejected` rather than an exception.
    fetchMock.mockResolvedValue(ok({ status_code: 'ERROR' }))

    expect(
      await instagramAdapter.resume({ account: ACCOUNT, publishRef: 'c1', claimedAt: null })
    ).toEqual({ kind: 'rejected', reason: 'Instagram container ERROR' })
  })

  it('treats an unreadable status as still processing', async () => {
    // A shape we do not recognise must never read as failure: the container may
    // be perfectly healthy, and failing it would abandon live media.
    fetchMock.mockResolvedValue(ok({}))

    expect(
      await instagramAdapter.resume({
        account: ACCOUNT,
        publishRef: 'c1',
        claimedAt: null,
        pollBudgetMs: 0,
      })
    ).toEqual({ kind: 'pending', publishRef: 'c1' })
  })
})

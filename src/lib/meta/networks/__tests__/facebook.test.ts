import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Facebook Pages, as a network adapter.
 *
 * Every shape asserted here was probed against a live Page before the adapter was written, and
 * the one that could not have been guessed is `attached_media`: the documentation spells it
 * `attached_media[0]={"media_fbid":"…"}`, a form encoding, while the shared Graph client sends
 * JSON bodies. A JSON array works — but only the probe could say so, and getting it wrong fails
 * at the one moment nobody is watching. Recorded in `docs/META-FB-PROBE.md`.
 *
 * The other half is the two-phase shape, which exists to stop duplicate posts. `publish` must
 * CREATE the post without making it live and hand back its id; `resume` makes it live. If
 * `publish` ever went live by itself again, a lost response would be retried by the Graph
 * client and then twice more by the ladder — the same post on the Page three times.
 *
 * ORDER is the third. A carousel is an ordered sequence and uploads run concurrently, so the
 * array handed to `/feed` must follow slide position rather than whichever upload answered
 * first. Meta documents no ordering guarantee either way; the probe established that the
 * attached order is the order the post reads in, which makes ours the half that can break.
 */

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const { facebookAdapter } = await import('../facebook')
const { resolveNetwork } = await import('../index')

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body, headers: new Headers() }
}

const ACCOUNT = { accountId: '723701000827665', accessToken: 'page-tok' }
const POST_ID = '723701000827665_122168909288960180'

function media(over: Partial<{ publicUrl: string; position: number }> = {}) {
  return { publicUrl: 'https://cdn/0.jpg', position: 0, contentType: 'image/jpeg', ...over }
}

/**
 * The JSON body of one fetch call, or null when it carries none.
 *
 * The runner itself invokes a stubbed global with no arguments, so a mock that assumes every
 * call has a body fails on something the adapter never did.
 */
function bodyOf(args: unknown[]): { url?: string; attached_media?: unknown } | null {
  const init = args[1] as { body?: string } | undefined
  return init?.body ? JSON.parse(init.body) : null
}

/** The bodies sent, in order, so the encoding itself can be asserted. */
function sentBodies(): Array<Record<string, unknown>> {
  return fetchMock.mock.calls
    .map((call) => bodyOf(call as unknown[]))
    .filter((body): body is Record<string, unknown> => body !== null)
}

beforeEach(() => fetchMock.mockReset())

describe('resolveNetwork', () => {
  it('resolves Facebook from either vocabulary', () => {
    expect(resolveNetwork('facebook')?.platform).toBe('facebook')
    expect(resolveNetwork('Facebook')?.platform).toBe('facebook')
  })
})

describe('accepts', () => {
  it('takes both kinds of post', () => {
    // A carousel becomes a multi-photo post: the same /feed call with more attachments. There
    // is no second code path, so there is nothing for this to refuse.
    expect(facebookAdapter.accepts('single')).toBe(true)
    expect(facebookAdapter.accepts('carousel')).toBe(true)
  })
})

describe('preflight', () => {
  it('blocks a post with no images, but not finally', () => {
    // Images land moments after approval, so an empty set is usually a race. Final would burn
    // the post instead of letting the next tick find it ready.
    expect(facebookAdapter.preflight({ caption: 'x', media: [] })).toEqual({
      message: 'No images attached',
      final: false,
    })
  })

  it('passes a normal single-image post', () => {
    expect(facebookAdapter.preflight({ caption: 'x', media: [media()] })).toBeNull()
  })

  it('passes a full ten-slide carousel', () => {
    // Ten was verified against a live Page; Meta documents no maximum at all.
    const ten = Array.from({ length: 10 }, (_, i) => media({ position: i }))
    expect(facebookAdapter.preflight({ caption: 'x', media: ten })).toBeNull()
  })

  it('finally blocks a post with more images than one post can carry', () => {
    // Final: a post does not lose slides on a retry. Refusing here beats failing mid-upload
    // with photos already sitting on the Page.
    const eleven = Array.from({ length: 11 }, (_, i) => media({ position: i }))
    expect(facebookAdapter.preflight({ caption: 'x', media: eleven })).toEqual({
      message: 'Facebook posts allow at most 10 images',
      final: true,
    })
  })
})

describe('publish', () => {
  it('uploads unpublished, then creates a post that is NOT yet live', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'photo-1' }))
      .mockResolvedValueOnce(ok({ id: POST_ID, post_supports_client_mutation_id: true }))

    const result = await facebookAdapter.publish({
      account: ACCOUNT,
      payload: { caption: 'Hello world', media: [media()] },
    })

    // Pending, not published: the caller persists this reference before anything makes it live,
    // which is what lets a dying run resume THIS post instead of creating another.
    expect(result).toEqual({ kind: 'pending', publishRef: POST_ID })

    const [photo, feed] = sentBodies()
    // `published: false` on the photo keeps it off the Page until a post carries it.
    expect(photo).toEqual({ url: 'https://cdn/0.jpg', published: false })
    // `published: false` on the post is the whole guard — a lost response here leaves an
    // invisible post, never a second live one.
    expect(feed).toEqual({
      message: 'Hello world',
      attached_media: [{ media_fbid: 'photo-1' }],
      published: false,
    })

    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls[0]).toContain('/723701000827665/photos')
    expect(urls[1]).toContain('/723701000827665/feed')
  })

  it('attaches a carousel in slide order even when uploads finish out of order', async () => {
    // The case concurrency creates: slide 4 answers first, slide 0 last. If the adapter
    // attached ids as they arrived, the carousel would read back shuffled — and Meta preserves
    // whatever order it is given, so nothing downstream would correct it.
    const slides = [4, 3, 2, 1, 0]
    fetchMock.mockImplementation((...args: unknown[]) => {
      const body = bodyOf(args)
      if (!body?.url) return Promise.resolve(ok({ id: POST_ID }))
      const slide = Number(/(\d+)\.jpg$/.exec(body.url)?.[1])
      // Later slides resolve sooner, so completion order is the reverse of slide order.
      return new Promise((resolve) =>
        setTimeout(() => resolve(ok({ id: `photo-${slide}` })), (5 - slide) * 2)
      )
    })

    await facebookAdapter.publish({
      account: ACCOUNT,
      payload: {
        caption: 'five slides',
        // Handed over shuffled, as an unordered query would return them.
        media: slides.map((position) =>
          media({ publicUrl: `https://cdn/${position}.jpg`, position })
        ),
      },
    })

    const feed = sentBodies().find((body) => 'attached_media' in body)
    expect(feed?.attached_media).toEqual([
      { media_fbid: 'photo-0' },
      { media_fbid: 'photo-1' },
      { media_fbid: 'photo-2' },
      { media_fbid: 'photo-3' },
      { media_fbid: 'photo-4' },
    ])
  })

  it('does not create the post when a photo upload fails', async () => {
    // Nothing may reach the Page, even invisibly, once the media is in doubt.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'bad image', code: 9004 } }),
      headers: new Headers(),
    })

    await expect(
      facebookAdapter.publish({ account: ACCOUNT, payload: { caption: 'x', media: [media()] } })
    ).rejects.toThrow()

    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls.some((url) => url.includes('/feed'))).toBe(false)
  })
})

describe('resume', () => {
  it('makes the created post live and reports its id', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true }))

    const result = await facebookAdapter.resume({
      account: ACCOUNT,
      publishRef: POST_ID,
      claimedAt: null,
    })

    expect(result).toEqual({ kind: 'published', externalPostId: POST_ID })
    expect(sentBodies()[0]).toEqual({ is_published: true })
    // Addressed by the post's own id — there is nothing to look up.
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(POST_ID)
  })

  it('is safe to run twice, which is the point of the two phases', async () => {
    // Meta answers success again for a post that is already live, so a retry after a lost
    // response confirms rather than duplicating. Verified against a live Page.
    fetchMock.mockResolvedValue(ok({ success: true }))

    const once = await facebookAdapter.resume({
      account: ACCOUNT,
      publishRef: POST_ID,
      claimedAt: null,
    })
    const twice = await facebookAdapter.resume({
      account: ACCOUNT,
      publishRef: POST_ID,
      claimedAt: null,
    })

    expect(twice).toEqual(once)
  })
})

describe('quotaRemaining', () => {
  it('is absent, which the contract reads as unmetered', () => {
    // Not zero. A `quotaRemaining` returning 0 would stop every Facebook publish.
    expect(facebookAdapter.quotaRemaining).toBeUndefined()
  })
})

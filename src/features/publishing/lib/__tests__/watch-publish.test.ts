import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

/**
 * The watcher that reports a deferred publish after the dialog has closed.
 *
 * It polls every three seconds, so the thing most likely to break silently is REPEATING itself:
 * a destination that settles must be announced once, not once per poll for the rest of the
 * minute. And it must announce each destination as it lands — networks finish at very different
 * speeds (a Facebook Page in ~7s, an Instagram carousel in 26-43s), and reporting only when the
 * slowest finished both hid the fast one's success and made a single failure read as the whole
 * post failing.
 */

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const { watchPublishOutcome } = await import('../watch-publish')

function publication(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pub-1',
    platform: 'instagram',
    status: 'publishing',
    published_at: null,
    publish_error: null,
    ...over,
  }
}

/** One poll's answer. */
function respond(publications: Array<Record<string, unknown>>) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ post: { post_publications: publications } }),
  })
}

function callbacks() {
  return { onSettled: vi.fn(), onDone: vi.fn(), onStillProcessing: vi.fn() }
}

/** One poll interval, with microtasks flushed so the fetch resolves inside it. */
const POLL = 3_000
const tick = () => vi.advanceTimersByTimeAsync(POLL)

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('watchPublishOutcome', () => {
  it('reports each destination as it lands, not when the slowest does', async () => {
    const cb = callbacks()
    // Facebook is live on the first poll; Instagram is still going.
    respond([
      publication({ id: 'a', platform: 'facebook', status: 'published' }),
      publication({ id: 'b', platform: 'instagram', status: 'publishing' }),
    ])
    watchPublishOutcome('post-1', cb)
    await tick()

    expect(cb.onSettled).toHaveBeenCalledExactlyOnceWith('facebook', 'published', null)
    // Nothing final yet — Instagram has not answered.
    expect(cb.onDone).not.toHaveBeenCalled()

    respond([
      publication({ id: 'a', platform: 'facebook', status: 'published' }),
      publication({ id: 'b', platform: 'instagram', status: 'published' }),
    ])
    await tick()

    expect(cb.onSettled).toHaveBeenCalledTimes(2)
    expect(cb.onSettled).toHaveBeenLastCalledWith('instagram', 'published', null)
    expect(cb.onDone).toHaveBeenCalledExactlyOnceWith({
      published: ['facebook', 'instagram'],
      failed: [],
    })
  })

  it('announces a settled destination once, however many times it is polled', async () => {
    // The regression a three-second poll invites: the same success toast forever.
    const cb = callbacks()
    for (let poll = 0; poll < 3; poll++) {
      respond([
        publication({ id: 'a', platform: 'facebook', status: 'published' }),
        publication({ id: 'b', platform: 'instagram', status: 'publishing' }),
      ])
    }
    watchPublishOutcome('post-1', cb)
    await tick()
    await tick()
    await tick()

    expect(cb.onSettled).toHaveBeenCalledTimes(1)
  })

  it('reports a failure against its own destination, and still finishes', async () => {
    // One network dying must not read as the post failing: the other still published, and the
    // card renders that mix as 'partly'.
    const cb = callbacks()
    respond([
      publication({ id: 'a', platform: 'facebook', status: 'published' }),
      publication({ id: 'b', platform: 'instagram', publish_error: 'Token expired' }),
    ])
    watchPublishOutcome('post-1', cb)
    await tick()

    expect(cb.onSettled).toHaveBeenCalledWith('instagram', 'failed', 'Token expired')
    expect(cb.onDone).toHaveBeenCalledExactlyOnceWith({
      published: ['facebook'],
      failed: ['instagram'],
    })
  })

  it('treats a re-armed destination as failed, not as still going', async () => {
    // A non-final failure bounces the row back to 'scheduled' and keeps its message. To the
    // person who pressed the button that is a failure, not silence.
    const cb = callbacks()
    respond([publication({ status: 'scheduled', publish_error: 'Meta timed out' })])
    watchPublishOutcome('post-1', cb)
    await tick()

    expect(cb.onSettled).toHaveBeenCalledExactlyOnceWith('instagram', 'failed', 'Meta timed out')
  })

  it('prefers a success over a message left by an earlier attempt', async () => {
    const cb = callbacks()
    respond([publication({ status: 'published', publish_error: 'a previous attempt bounced' })])
    watchPublishOutcome('post-1', cb)
    await tick()

    expect(cb.onSettled).toHaveBeenCalledExactlyOnceWith('instagram', 'published', null)
  })

  it('names what is still in flight when the watch window closes', async () => {
    const cb = callbacks()
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        post: {
          post_publications: [
            publication({ id: 'a', platform: 'facebook', status: 'published' }),
            publication({ id: 'b', platform: 'instagram', status: 'publishing' }),
          ],
        },
      }),
    })
    watchPublishOutcome('post-1', cb)
    // Past the 60s budget.
    await vi.advanceTimersByTimeAsync(70_000)

    expect(cb.onStillProcessing).toHaveBeenCalledExactlyOnceWith(['instagram'])
    expect(cb.onDone).not.toHaveBeenCalled()
  })

  it('keeps polling through a failed read rather than reporting one', async () => {
    const cb = callbacks()
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    respond([publication({ status: 'published' })])
    watchPublishOutcome('post-1', cb)
    await tick()

    expect(cb.onSettled).not.toHaveBeenCalled()

    await tick()
    expect(cb.onSettled).toHaveBeenCalledExactlyOnceWith('instagram', 'published', null)
  })
})

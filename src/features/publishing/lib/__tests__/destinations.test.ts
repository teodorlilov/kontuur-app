import { describe, expect, it, vi } from 'vitest'

const { mocks } = vi.hoisted(() => ({ mocks: { createPublications: vi.fn() } }))
vi.mock('@/features/publishing/lib/publication-store', () => ({
  createPublications: mocks.createPublications,
}))

import { assignDestinations, capableDestinations } from '../destinations'

/**
 * Where a post goes is now a choice, and a choice arrives from a browser.
 *
 * `chosen` is a statement of INTENT — the calendar sends back the destinations the server gave
 * it, and a chooser will send a subset. What a post can actually reach stays the server's answer,
 * so the two are intersected rather than trusted. Nothing else in `npm run check` can see that:
 * the types permit any string array, and a post published to a network its client never connected
 * would fail at the Graph call, days later, as a publish error nobody could explain.
 */

/** A Supabase double returning one client's connected platforms. */
function fakeAdmin(connected: string[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ not: async () => ({ data: connected.map((platform) => ({ platform })) }) }),
      }),
    }),
  } as never
}

describe('capableDestinations', () => {
  it('keeps a connected network that takes this kind of post', () => {
    expect(capableDestinations(['instagram'], 'single')).toEqual(['instagram'])
    expect(capableDestinations(['instagram'], 'carousel')).toEqual(['instagram'])
  })

  it('drops a connection that is not a publishing network at all', () => {
    // Canva shares `social_connections` and resolves to no adapter — the same answer as "we
    // cannot publish there", which is why it needs no special case anywhere else.
    expect(capableDestinations(['canva', 'instagram'], 'single')).toEqual(['instagram'])
  })

  it('drops a network nothing has taught us to publish to', () => {
    expect(capableDestinations(['facebook', 'linkedin'], 'single')).toEqual([])
  })

  it('answers from the adapter, so capability is never a list kept beside it', () => {
    // The rule that makes this worth a function: `accepts` belongs to the network. A constant
    // listing "platforms that take carousels" would have to stay in agreement with the adapters,
    // and the list is what goes stale.
    expect(capableDestinations([], 'carousel')).toEqual([])
  })
})

describe('assignDestinations', () => {
  it('records every reachable destination when the caller has no choice to offer', async () => {
    mocks.createPublications.mockResolvedValue([{ id: 'pub-1' }])

    await assignDestinations(fakeAdmin(['instagram']), 'post-1', 'client-1', 'single', 'all')

    expect(mocks.createPublications).toHaveBeenCalledWith(expect.anything(), 'post-1', [
      'instagram',
    ])
  })

  it('narrows to what the caller chose', async () => {
    mocks.createPublications.mockResolvedValue([{ id: 'pub-1' }])

    await assignDestinations(fakeAdmin(['instagram', 'canva']), 'post-1', 'client-1', 'single', [
      'instagram',
    ])

    expect(mocks.createPublications).toHaveBeenCalledWith(expect.anything(), 'post-1', [
      'instagram',
    ])
  })

  it('refuses a destination the client has not connected', async () => {
    // The boundary. A browser asking for a network this client never connected must not get a
    // publication row for it — the intersection is what stops the request being taken at its word.
    mocks.createPublications.mockClear()

    const created = await assignDestinations(
      fakeAdmin(['instagram']),
      'post-1',
      'client-1',
      'single',
      ['facebook']
    )

    expect(created).toEqual([])
    expect(mocks.createPublications).not.toHaveBeenCalled()
  })

  it('writes nothing when the choice is empty', async () => {
    mocks.createPublications.mockClear()

    expect(
      await assignDestinations(fakeAdmin(['instagram']), 'post-1', 'client-1', 'single', [])
    ).toEqual([])
    expect(mocks.createPublications).not.toHaveBeenCalled()
  })
})

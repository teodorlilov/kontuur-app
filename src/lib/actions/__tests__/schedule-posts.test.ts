import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * The contract that lets the dashboard's approve share the review queue's writer.
 *
 * `schedulePosts` reported `ok: true` whatever happened. `verifyPostsOwnership` drops unowned ids
 * silently, and a failed UPDATE only reached a `failures` array that was logged — so a run in
 * which nothing landed was indistinguishable, to its caller, from one that worked.
 *
 * That is survivable for the batch bar, which reads a count. It is not survivable for an
 * optimistic single-post caller: the dashboard removes the row on `ok` and offers an 8-second
 * Undo, so a silent failure meant the post vanished from the queue and the Undo then wrote
 * `pending_review` over a post that had never been approved. Fixing this was the precondition for
 * merging the two approve paths, not a tidy-up alongside it.
 */

const POST_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const AGENCY_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

const { mocks } = vi.hoisted(() => ({
  mocks: {
    resolveActionAuth: vi.fn(),
    verifyPostsOwnership: vi.fn(),
    fetchOwnedPost: vi.fn(),
    revalidateTag: vi.fn(),
    revalidatePath: vi.fn(),
    assignDestinations: vi.fn(),
    withdrawPendingPublications: vi.fn(),
  },
}))

/**
 * Giving a post a slot is what gives it destinations, so scheduling now reaches the
 * publication store. Mocked at the boundary: these assertions are about the ownership and
 * failure reporting contract, and a real admin client would need credentials to prove it.
 */
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => ({}),
}))
vi.mock('@/features/publishing/lib/destinations', () => ({
  assignDestinations: mocks.assignDestinations,
}))
vi.mock('@/features/publishing/lib/publication-store', () => ({
  withdrawPendingPublications: mocks.withdrawPendingPublications,
}))

vi.mock('@/lib/auth/helpers', () => ({
  resolveActionAuth: mocks.resolveActionAuth,
  verifyPostsOwnership: mocks.verifyPostsOwnership,
  fetchOwnedPost: mocks.fetchOwnedPost,
}))
vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
  revalidatePath: mocks.revalidatePath,
  unstable_cache: (fn: unknown) => fn,
}))

import { schedulePost, schedulePosts } from '../post-actions'

/** A Supabase double: the caption read, then the UPDATE whose outcome the test is about. */
function fakeSupabase(
  updateError: { message: string } | null,
  readError: { message: string } | null = null
) {
  return {
    from: vi.fn(() => ({
      select: () => ({
        in: async () => ({
          data: readError ? null : [{ id: POST_ID, caption: 'fine', post_type: 'single' }],
          error: readError,
        }),
      }),
      update: () => ({ in: async () => ({ error: updateError }) }),
    })),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveActionAuth.mockResolvedValue({
    ok: true,
    supabase: fakeSupabase(null),
    agencyId: AGENCY_ID,
  })
  mocks.verifyPostsOwnership.mockResolvedValue(new Set([POST_ID]))
  // Non-empty: the default is a post that resolved somewhere to publish.
  mocks.assignDestinations.mockResolvedValue([{ id: 'pub-1', platform: 'instagram' }])
  mocks.withdrawPendingPublications.mockResolvedValue(undefined)
})

describe('schedulePost', () => {
  it('reports a failure when its one post did not move', async () => {
    mocks.resolveActionAuth.mockResolvedValue({
      ok: true,
      supabase: fakeSupabase({ message: 'deadlock detected' }),
      agencyId: AGENCY_ID,
    })

    const result = await schedulePost(POST_ID, null, [])

    // The whole point. `ok: true` here removes the row from the dashboard queue and arms an Undo
    // against a post that is still pending_review.
    expect(result.ok).toBe(false)
  })

  it('reports a failure when the post was not the caller’s to move', async () => {
    mocks.verifyPostsOwnership.mockResolvedValue(new Set<string>())

    const result = await schedulePost(POST_ID, null, [])

    // Ownership drops the id rather than raising, so this arrived as `succeeded: 0` wearing `ok`.
    expect(result.ok).toBe(false)
  })

  it('succeeds when the post moved', async () => {
    expect(await schedulePost(POST_ID, null, [])).toEqual({
      ok: true,
      data: { nowhereToGo: false },
    })
  })
})

describe('schedulePosts', () => {
  it('fails the batch when nothing at all landed', async () => {
    mocks.verifyPostsOwnership.mockResolvedValue(new Set<string>())

    const result = await schedulePosts([{ postId: POST_ID, scheduledAt: null, platforms: [] }])

    expect(result.ok).toBe(false)
  })

  it('still reports a partial batch as a success with its count', async () => {
    const other = '9f8b1c22-0000-4000-8000-000000000002'
    // Only one of the two is the caller's; a partial result is a real outcome the batch bar
    // renders as "Scheduled 1 of 2", so it must NOT become an error.
    mocks.verifyPostsOwnership.mockResolvedValue(new Set([POST_ID]))

    const result = await schedulePosts([
      { postId: POST_ID, scheduledAt: null, platforms: [] },
      { postId: other, scheduledAt: null, platforms: [] },
    ])

    expect(result).toEqual({ ok: true, data: { succeeded: 1, total: 2, nowhereToGo: 0 } })
  })
})

/**
 * Giving a post a slot is what gives it destinations, so the half of this action that writes
 * `post_publications` has its own failure modes — and every one of them used to end in the same
 * place: the posts row scheduled, no destination written, and `ok: true` returned. A post in that
 * state is invisible to the publish cron forever, because the cron reads publications.
 */
describe('schedulePosts — the destinations half', () => {
  it('fails rather than scheduling blind when the read behind it errors', async () => {
    // That one read supplies the caption gate AND the client/post_type each publication is built
    // from. Its error was discarded, so a transient failure skipped validation, created nothing,
    // and still reported success.
    mocks.resolveActionAuth.mockResolvedValue({
      ok: true,
      supabase: fakeSupabase(null, { message: 'statement timeout' }),
      agencyId: AGENCY_ID,
    })

    const result = await schedulePosts([
      { postId: POST_ID, scheduledAt: '2026-09-08T09:00:00.000Z', platforms: ['instagram'] },
    ])

    expect(result.ok).toBe(false)
    expect(mocks.assignDestinations).not.toHaveBeenCalled()
  })

  it('reports a schedule that resolves to nowhere WITHOUT calling it a failure', async () => {
    // No connected account that can take this post. Writing no rows was accepted in silence, so
    // the calendar showed it queued and it never went anywhere.
    mocks.assignDestinations.mockResolvedValue([])

    const result = await schedulePosts([
      { postId: POST_ID, scheduledAt: '2026-09-08T09:00:00.000Z', platforms: ['instagram'] },
    ])

    // Asked, and answered with nothing — which is the answer that has to reach the user.
    // The posts UPDATE has already committed by this point, so `ok: false` would be a lie about
    // a write that happened — and every optimistic caller rolls its UI back on a falsy result,
    // putting the card back and announcing the post was never scheduled. The count rides the
    // success payload instead.
    expect(mocks.assignDestinations).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, data: { succeeded: 1, total: 1, nowhereToGo: 1 } })
  })

  it('does not let a destination write throw out of the action', async () => {
    // The throw escaped after the posts UPDATE had committed: the rest of the batch was abandoned
    // and the caller got a rejected promise over rows that were already scheduled.
    mocks.assignDestinations.mockRejectedValue(new Error('publications upsert failed'))

    await expect(
      schedulePosts([
        { postId: POST_ID, scheduledAt: '2026-09-08T09:00:00.000Z', platforms: ['instagram'] },
      ])
    ).resolves.toEqual({ ok: true, data: { succeeded: 1, total: 1, nowhereToGo: 1 } })
  })

  it('writes no destinations for a post whose row never moved', async () => {
    // The loop re-walked every group regardless of which UPDATE succeeded, so a failed group still
    // had publications written against a slot its post never took.
    mocks.resolveActionAuth.mockResolvedValue({
      ok: true,
      supabase: fakeSupabase({ message: 'deadlock detected' }),
      agencyId: AGENCY_ID,
    })

    await schedulePosts([
      { postId: POST_ID, scheduledAt: '2026-09-08T09:00:00.000Z', platforms: ['instagram'] },
    ])

    expect(mocks.assignDestinations).not.toHaveBeenCalled()
    expect(mocks.withdrawPendingPublications).not.toHaveBeenCalled()
  })
})

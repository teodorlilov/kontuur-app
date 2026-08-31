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
  },
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
function fakeSupabase(updateError: { message: string } | null) {
  return {
    from: vi.fn(() => ({
      select: () => ({ in: async () => ({ data: [{ id: POST_ID, caption: 'fine' }] }) }),
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
})

describe('schedulePost', () => {
  it('reports a failure when its one post did not move', async () => {
    mocks.resolveActionAuth.mockResolvedValue({
      ok: true,
      supabase: fakeSupabase({ message: 'deadlock detected' }),
      agencyId: AGENCY_ID,
    })

    const result = await schedulePost(POST_ID, null)

    // The whole point. `ok: true` here removes the row from the dashboard queue and arms an Undo
    // against a post that is still pending_review.
    expect(result.ok).toBe(false)
  })

  it('reports a failure when the post was not the caller’s to move', async () => {
    mocks.verifyPostsOwnership.mockResolvedValue(new Set<string>())

    const result = await schedulePost(POST_ID, null)

    // Ownership drops the id rather than raising, so this arrived as `succeeded: 0` wearing `ok`.
    expect(result.ok).toBe(false)
  })

  it('succeeds when the post moved', async () => {
    expect(await schedulePost(POST_ID, null)).toEqual({ ok: true, data: undefined })
  })
})

describe('schedulePosts', () => {
  it('fails the batch when nothing at all landed', async () => {
    mocks.verifyPostsOwnership.mockResolvedValue(new Set<string>())

    const result = await schedulePosts([{ postId: POST_ID, scheduledAt: null }])

    expect(result.ok).toBe(false)
  })

  it('still reports a partial batch as a success with its count', async () => {
    const other = '9f8b1c22-0000-4000-8000-000000000002'
    // Only one of the two is the caller's; a partial result is a real outcome the batch bar
    // renders as "Scheduled 1 of 2", so it must NOT become an error.
    mocks.verifyPostsOwnership.mockResolvedValue(new Set([POST_ID]))

    const result = await schedulePosts([
      { postId: POST_ID, scheduledAt: null },
      { postId: other, scheduledAt: null },
    ])

    expect(result).toEqual({ ok: true, data: { succeeded: 1, total: 2 } })
  })
})

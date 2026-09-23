import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Which deletes are discards. A discard is a verdict on the post's source — telemetry the
 * research ranking reads — so only a post nobody had approved yet produces one, attributed to the
 * surface that held it, and never when the wizard is merely clearing a client's waiting drafts to
 * start over.
 */

const POST_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const AGENCY_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

const { mocks } = vi.hoisted(() => ({
  mocks: {
    resolveActionAuth: vi.fn(),
    fetchOwnedPost: vi.fn(),
    recordDiscardedDraft: vi.fn(),
    removeStoragePrefix: vi.fn(),
  },
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: () => ({}) }))
vi.mock('@/lib/auth/helpers', () => ({
  resolveActionAuth: mocks.resolveActionAuth,
  fetchOwnedPost: mocks.fetchOwnedPost,
  verifyPostsOwnership: vi.fn(),
}))
vi.mock('@/lib/queries/discarded-drafts', () => ({
  recordDiscardedDraft: mocks.recordDiscardedDraft,
}))
vi.mock('@/lib/storage/remove-prefix', () => ({
  removeStoragePrefix: mocks.removeStoragePrefix,
}))
vi.mock('@/lib/billing/require-entitled', () => ({ requireEntitledAction: async () => null }))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

import { deletePost } from '../post-actions'

/** A Supabase double: the provenance read, then the DELETE. */
function fakeSupabase(status: string) {
  return {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              client_id: 'c1',
              client_source_id: 's1',
              pillar: 'Trends',
              source_url: 'https://example.com/a',
              source_type: 'web_search',
              status,
            },
          }),
        }),
      }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    })),
  }
}

function authAs(status: string) {
  mocks.resolveActionAuth.mockResolvedValue({
    ok: true,
    supabase: fakeSupabase(status),
    agencyId: AGENCY_ID,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchOwnedPost.mockResolvedValue({ id: POST_ID, client_id: 'c1' })
  mocks.recordDiscardedDraft.mockResolvedValue(true)
  mocks.removeStoragePrefix.mockResolvedValue(0)
})

describe('deletePost — which deletes are discards', () => {
  it("a wizard draft is the wizard's discard", async () => {
    authAs('draft')

    expect(await deletePost(POST_ID)).toEqual({ ok: true, data: undefined })
    expect(mocks.recordDiscardedDraft).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'c1', clientSourceId: 's1', discardedFrom: 'wizard' })
    )
  })

  it("a queue draft is the review's discard, with the reviewer's reason", async () => {
    authAs('pending_review')

    await deletePost(POST_ID, { reason: 'off_brand' })
    expect(mocks.recordDiscardedDraft).toHaveBeenCalledWith(
      expect.objectContaining({ discardedFrom: 'review', reason: 'off_brand' })
    )
  })

  it('an approved post is housekeeping, not a verdict on its source', async () => {
    authAs('approved')

    await deletePost(POST_ID)
    expect(mocks.recordDiscardedDraft).not.toHaveBeenCalled()
  })

  it('clearing waiting drafts for a new run records nothing', async () => {
    authAs('draft')

    await deletePost(POST_ID, { countAsDiscard: false })
    expect(mocks.recordDiscardedDraft).not.toHaveBeenCalled()
    expect(mocks.removeStoragePrefix).toHaveBeenCalledTimes(1)
  })
})

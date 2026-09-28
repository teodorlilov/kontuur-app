import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireEntitledAction: vi.fn(),
  rearmPublication: vi.fn(),
  publication: vi.fn(),
  slotWrite: vi.fn(),
}))
vi.mock('@/lib/auth/helpers', () => ({
  resolveActionAuth: async () => ({
    ok: true,
    agencyId: 'a1',
    supabase: {
      from: () => ({ update: (row: unknown) => ({ eq: () => mocks.slotWrite(row) }) }),
    },
  }),
  fetchOwnedPost: async () => ({ id: 'p1' }),
}))
vi.mock('@/lib/billing/require-entitled', () => ({
  requireEntitledAction: (...args: unknown[]) => mocks.requireEntitledAction(...args),
}))
vi.mock('@/features/publishing/lib/publication-store', () => ({
  rearmPublication: (...args: unknown[]) => mocks.rearmPublication(...args),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => ({
    from: () => {
      const read = { select: () => read, eq: () => read, maybeSingle: () => mocks.publication() }
      return read
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

import { rearmFailedPublication } from '../post-recovery'

const SLOT = { scheduledAt: '2026-10-01T09:00:00+03:00' }

describe('rearmFailedPublication', () => {
  beforeEach(() => {
    mocks.requireEntitledAction.mockReset().mockResolvedValue(null)
    mocks.rearmPublication.mockReset().mockResolvedValue({ rearmed: true, error: null })
    mocks.slotWrite.mockReset().mockResolvedValue({ error: null })
    mocks.publication.mockReset().mockResolvedValue({
      data: { post_id: 'p1', platform: 'instagram', posts: { caption: 'Short and fine.' } },
      error: null,
    })
  })

  it('puts a failed Instagram destination back in the queue', async () => {
    expect(await rearmFailedPublication('pub-1', SLOT)).toEqual({ ok: true, data: undefined })
    expect(mocks.rearmPublication).toHaveBeenCalled()
  })

  it('refuses an Instagram caption past the limit, writing nothing — Meta would refuse it and burn the reset attempts', async () => {
    mocks.publication.mockResolvedValue({
      data: { post_id: 'p1', platform: 'instagram', posts: { caption: 'x'.repeat(2201) } },
      error: null,
    })
    const result = await rearmFailedPublication('pub-1', SLOT)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/Instagram allows 2,200/)
    expect(mocks.slotWrite).not.toHaveBeenCalled()
    expect(mocks.rearmPublication).not.toHaveBeenCalled()
  })

  it('is a publish, so a workspace that may not publish is refused first', async () => {
    mocks.requireEntitledAction.mockResolvedValue({ ok: false, error: 'Your workspace is paused.' })
    expect(await rearmFailedPublication('pub-1', SLOT)).toEqual({
      ok: false,
      error: 'Your workspace is paused.',
    })
    expect(mocks.requireEntitledAction).toHaveBeenCalledWith('a1', 'publish')
    expect(mocks.publication).not.toHaveBeenCalled()
  })
})

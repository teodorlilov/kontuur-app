import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cached: null as { agency_id: string; role: string } | null,
  fresh: null as { agency_id: string; role: string } | null,
  freshReads: 0,
}))
vi.mock('next/cache', () => ({
  unstable_cache: () => async () => mocks.cached,
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            mocks.freshReads += 1
            return { data: mocks.fresh }
          },
        }),
      }),
    }),
  }),
}))

import { getCachedUserRecord } from '../helpers'

/**
 * The cached user record and the one state it must not trust: a cached "no row".
 *
 * The row is created right after the first render that can miss it, nothing can bust the tag
 * from a render, and a served miss sends every page's requireSessionUser to /login in a loop.
 */
describe('getCachedUserRecord', () => {
  beforeEach(() => {
    mocks.cached = null
    mocks.fresh = null
    mocks.freshReads = 0
  })

  it('serves a cached row without a second read', async () => {
    mocks.cached = { agency_id: 'agency-1', role: 'admin' }
    expect(await getCachedUserRecord('user-1')).toEqual({ agency_id: 'agency-1', role: 'admin' })
    expect(mocks.freshReads).toBe(0)
  })

  it('re-reads uncached when the cache says there is no row', async () => {
    mocks.fresh = { agency_id: 'agency-1', role: 'admin' }
    expect(await getCachedUserRecord('user-1')).toEqual({ agency_id: 'agency-1', role: 'admin' })
    expect(mocks.freshReads).toBe(1)
  })

  it('is null only when the row really is missing', async () => {
    expect(await getCachedUserRecord('user-1')).toBeNull()
    expect(mocks.freshReads).toBe(1)
  })
})

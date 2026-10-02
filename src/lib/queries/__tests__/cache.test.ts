import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ read: vi.fn(), list: vi.fn() }))

/**
 * Next's data cache as far as these cases need it: a resolved value is stored per argument list
 * and served again; a throw is not stored, so the next call runs the read again.
 */
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => {
    const stored = new Map<string, R>()
    return async (...args: A): Promise<R> => {
      const key = JSON.stringify(args)
      if (stored.has(key)) return stored.get(key) as R
      const value = await fn(...args)
      stored.set(key, value)
      return value
    }
  },
}))
vi.mock('react', async (importActual) => ({
  ...(await importActual<typeof import('react')>()),
  cache: <F>(fn: F) => fn,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => mocks.read(), order: () => mocks.list() }),
      }),
    }),
  }),
}))

import { getCachedAgency, getCachedAgencyClients, getCachedEntitlement } from '../cache'

describe('getCachedAgency', () => {
  beforeEach(() => {
    mocks.read.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('answers null for a failed read, logs it, and reads again rather than lock a paying workspace for a minute', async () => {
    mocks.read
      .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
      .mockResolvedValueOnce({ data: { id: 'a1', name: 'Acme' }, error: null })
    expect(await getCachedAgency('a1')).toBeNull()
    expect(console.error).toHaveBeenCalledWith(
      '[cache] agency read failed for a1:',
      expect.any(Error)
    )
    expect(await getCachedAgency('a1')).toMatchObject({ id: 'a1', name: 'Acme' })
    expect(mocks.read).toHaveBeenCalledTimes(2)
  })

  it('makes a workspace with no row a locked one', async () => {
    mocks.read.mockResolvedValue({ data: null, error: null })
    const entitlement = await getCachedEntitlement('gone')
    expect(entitlement.state).toBe('locked')
    expect(entitlement.canSpend).toBe(false)
  })
})

describe('getCachedAgencyClients', () => {
  beforeEach(() => mocks.list.mockReset())

  it('throws a failed read rather than store "no clients" for a minute, and reads again', async () => {
    mocks.list
      .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
      .mockResolvedValueOnce({ data: [{ id: 'c1' }], error: null })
    await expect(getCachedAgencyClients('a2')).rejects.toThrow(/agency clients read failed/)
    expect(await getCachedAgencyClients('a2')).toEqual([{ id: 'c1' }])
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })
})

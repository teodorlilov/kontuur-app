import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_USER_ID_HEADER } from '@/lib/auth/headers'
import { SIGN_IN_PATH } from '@/utils/constants'

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  headers: new Headers(),
}))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/headers', () => ({ headers: async () => mocks.headers }))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/auth/helpers', () => ({ getCachedUserRecord: vi.fn() }))

import { requireAuthUserId } from '../session'

/**
 * The signed-in gate every protected layout shares: the id middleware validated, or the one
 * redirect to the sign-in dialog. Pinned so a layout cannot quietly grow its own copy pointing
 * somewhere else.
 */
describe('requireAuthUserId', () => {
  beforeEach(() => {
    mocks.redirect.mockReset()
    mocks.headers = new Headers()
  })

  it('returns the id middleware stamped on the request', async () => {
    mocks.headers.set(AUTH_USER_ID_HEADER, 'user-1')
    await expect(requireAuthUserId()).resolves.toBe('user-1')
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('sends a request with no validated identity to the sign-in dialog', async () => {
    await requireAuthUserId()
    expect(mocks.redirect).toHaveBeenCalledTimes(1)
    expect(mocks.redirect).toHaveBeenCalledWith(SIGN_IN_PATH)
  })
})

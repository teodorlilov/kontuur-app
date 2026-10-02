import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The one provisioning path the dashboard layout and /setup-password share. What is pinned: a
 * person with a row costs no auth-server round trip and writes nothing; a person without one is
 * created from their own auth user's id, email and metadata, then read back; an id with no auth
 * user behind it provisions nothing and says so; and a refused provision throws.
 */

const ADMIN = { admin: true }
const ROW = { agency_id: 'agency-1', role: 'member' }

const mocks = vi.hoisted(() => ({
  getCachedUserRecord: vi.fn(),
  getAuthUser: vi.fn(),
  createUserRecord: vi.fn(),
  reread: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => ({
  getCachedUserRecord: mocks.getCachedUserRecord,
  getAuthUser: mocks.getAuthUser,
}))
vi.mock('@/lib/auth/create-user-record', () => ({ createUserRecord: mocks.createUserRecord }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: () => ADMIN }))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async () => mocks.reread(table, columns, column, value),
        }),
      }),
    }),
  }),
}))

import { provisionUserRecord } from '../provision-user-record'

describe('provisionUserRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCachedUserRecord.mockResolvedValue(null)
    mocks.getAuthUser.mockResolvedValue({
      id: 'user-1',
      email: 'ana@example.com',
      user_metadata: { agency_name: 'About Social Media', invite_tag: 'tag-1' },
    })
    mocks.createUserRecord.mockResolvedValue({ isInvited: true })
    mocks.reread.mockResolvedValue({ data: ROW, error: null })
  })

  it('does nothing for a person who has a row', async () => {
    mocks.getCachedUserRecord.mockResolvedValue(ROW)
    expect(await provisionUserRecord('user-1')).toEqual({ isSignedIn: true, record: ROW })
    expect(mocks.getAuthUser).not.toHaveBeenCalled()
    expect(mocks.createUserRecord).not.toHaveBeenCalled()
    expect(mocks.reread).not.toHaveBeenCalled()
  })

  it('creates the row from the auth user’s id, email and metadata, then reads it back', async () => {
    expect(await provisionUserRecord('user-1')).toEqual({ isSignedIn: true, record: ROW })
    expect(mocks.createUserRecord).toHaveBeenCalledWith(ADMIN, {
      id: 'user-1',
      email: 'ana@example.com',
      user_metadata: { agency_name: 'About Social Media', invite_tag: 'tag-1' },
    })
    expect(mocks.reread).toHaveBeenCalledWith('users', 'agency_id, role', 'id', 'user-1')
  })

  it('provisions nothing when no auth user stands behind the id', async () => {
    mocks.getAuthUser.mockResolvedValue(null)
    expect(await provisionUserRecord('user-1')).toEqual({ isSignedIn: false })
    expect(mocks.createUserRecord).not.toHaveBeenCalled()
  })

  it('throws what createUserRecord throws', async () => {
    mocks.createUserRecord.mockRejectedValue(
      new Error('signup metadata is missing a business name or mode')
    )
    await expect(provisionUserRecord('user-1')).rejects.toThrow('missing a business name')
    expect(mocks.reread).not.toHaveBeenCalled()
  })

  it('throws when the row it just made cannot be read back', async () => {
    mocks.reread.mockResolvedValue({ data: null, error: { message: 'timeout' } })
    await expect(provisionUserRecord('user-1')).rejects.toThrow(
      'users read after provisioning failed for user-1: timeout'
    )
  })
})

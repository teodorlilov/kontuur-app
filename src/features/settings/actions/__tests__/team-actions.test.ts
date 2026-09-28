import { beforeEach, describe, expect, it, vi } from 'vitest'

const MEMBER = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'

const mocks = vi.hoisted(() => ({
  deleteAuthIdentity: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  deletes: [] as Array<{ table: string; column: string; value: string }>,
}))
vi.mock('@/lib/auth/helpers', () => ({
  resolveActionAuth: async () => ({ ok: true, supabase: {}, agencyId: 'a1', userId: 'admin-1' }),
  verifyAdminRole: async () => true,
}))
vi.mock('@/lib/auth/session', () => ({ USER_RECORD_TAG: 'user-record' }))
vi.mock('@/lib/auth/delete-auth-identity', () => ({ deleteAuthIdentity: mocks.deleteAuthIdentity }))
vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
  revalidatePath: mocks.revalidatePath,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => ({
    from(table: string) {
      const read = {
        select: () => read,
        eq: () => read,
        maybeSingle: async () => ({
          data: { id: MEMBER, role: 'member', agency_id: 'a1' },
          error: null,
        }),
      }
      return {
        ...read,
        delete: () => ({
          eq: async (column: string, value: string) => {
            mocks.deletes.push({ table, column, value })
            return { error: null }
          },
        }),
      }
    },
  }),
}))

import { removeTeamMember } from '../team-actions'

describe('removeTeamMember', () => {
  beforeEach(() => {
    mocks.deletes.length = 0
    mocks.deleteAuthIdentity.mockReset().mockResolvedValue(true)
    mocks.revalidateTag.mockReset()
    mocks.revalidatePath.mockReset()
  })

  it('removes their invite rows before their user row, then their login, so no pending invite can join the login back', async () => {
    expect(await removeTeamMember(MEMBER)).toEqual({ ok: true, data: { notice: null } })
    expect(mocks.deletes.map((d) => d.table)).toEqual([
      'social_connections',
      'team_invites',
      'users',
    ])
    expect(mocks.deletes[1]).toEqual({
      table: 'team_invites',
      column: 'auth_user_id',
      value: MEMBER,
    })
    expect(mocks.deleteAuthIdentity).toHaveBeenCalledWith(expect.anything(), MEMBER, 'team:remove')
  })

  it('answers a done removal with a notice when the login survives, and busts the cached workspace', async () => {
    mocks.deleteAuthIdentity.mockResolvedValue(false)
    expect(await removeTeamMember(MEMBER)).toEqual({
      ok: true,
      data: {
        notice:
          'They were removed from the workspace, but their login could not be deleted. Contact support to finish removing it.',
      },
    })
    expect(mocks.revalidateTag).toHaveBeenCalledWith('user-record', 'max')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/settings')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyAdminRole: vi.fn(),
  adminUpdate: vi.fn(),
  tenantUpdate: vi.fn(),
}))
vi.mock('@/lib/auth/resolve-auth', () => ({
  resolveAuth: async () => ({
    ok: true,
    supabase: { from: () => ({ update: mocks.tenantUpdate }) },
    agencyId: 'a1',
    userId: 'u1',
  }),
}))
vi.mock('@/lib/auth/helpers', () => ({ verifyAdminRole: mocks.verifyAdminRole }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({
      update: (row: unknown) => ({ eq: (_c: string, id: string) => mocks.adminUpdate(row, id) }),
    }),
  }),
}))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

import { PUT } from '../account/route'

function put(body: Record<string, unknown>) {
  return PUT(
    new Request('https://kontuur.app/api/settings/account', {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  )
}

describe('PUT /api/settings/account', () => {
  beforeEach(() => {
    mocks.verifyAdminRole.mockReset().mockResolvedValue(true)
    mocks.adminUpdate.mockReset().mockResolvedValue({ error: null })
    mocks.tenantUpdate.mockReset()
  })

  it('refuses a member before anything is written', async () => {
    mocks.verifyAdminRole.mockResolvedValue(false)
    expect((await put({ name: 'Renamed' })).status).toBe(403)
    expect(mocks.adminUpdate).not.toHaveBeenCalled()
  })

  it('writes an admin’s change via the admin client, scoped to their workspace: the tenant role has no update grant (20260862)', async () => {
    expect((await put({ name: 'Renamed' })).status).toBe(200)
    expect(mocks.adminUpdate).toHaveBeenCalledWith({ name: 'Renamed' }, 'a1')
    expect(mocks.tenantUpdate).not.toHaveBeenCalled()
  })
})

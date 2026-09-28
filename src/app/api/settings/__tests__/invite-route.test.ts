import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyAdminRole: vi.fn(),
  inviteMember: vi.fn(),
}))
const admin = {}
vi.mock('@/lib/auth/resolve-auth', () => ({
  resolveAuth: async () => ({ ok: true, supabase: {}, agencyId: 'a1', userId: 'admin-1' }),
}))
vi.mock('@/lib/auth/helpers', () => ({ verifyAdminRole: mocks.verifyAdminRole }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: () => admin }))
vi.mock('@/features/settings/lib/invite-member', () => ({ inviteMember: mocks.inviteMember }))

import { POST } from '../team/invite/route'

function invite(body: unknown = { email: '  New@Acme.com ', role: 'member' }) {
  return POST(
    new Request('https://kontuur.app/api/settings/team/invite', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  )
}

/**
 * The route's half of an invite: who may ask, what a valid ask is, and how the operation's answer
 * (`inviteMember`, tested beside it) becomes a response. The operation's rules are not here.
 */
describe('POST /api/settings/team/invite', () => {
  beforeEach(() => {
    mocks.verifyAdminRole.mockReset().mockResolvedValue(true)
    mocks.inviteMember.mockReset().mockResolvedValue({ ok: true, notice: null })
  })

  it('hands the operation the trimmed, lower-cased address and the caller as inviter', async () => {
    const response = await invite()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, notice: null })
    expect(mocks.inviteMember).toHaveBeenCalledWith(admin, {
      agencyId: 'a1',
      inviterId: 'admin-1',
      email: 'new@acme.com',
      role: 'member',
    })
  })

  it('defaults an omitted role to member, never admin', async () => {
    await invite({ email: 'new@acme.com' })
    expect(mocks.inviteMember.mock.calls[0]?.[1]).toMatchObject({ role: 'member' })
  })

  it('answers ok with the operation’s notice when the invite went out unfinished', async () => {
    const notice =
      'The invite was sent, but the new role could not be saved. Send it again to change the role.'
    mocks.inviteMember.mockResolvedValue({ ok: true, notice })
    const response = await invite()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, notice })
  })

  it('answers with the operation’s status and sentence when it refuses', async () => {
    mocks.inviteMember.mockResolvedValue({
      ok: false,
      status: 409,
      error: 'This email has a pending invite to another workspace.',
    })
    const response = await invite()
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'This email has a pending invite to another workspace.',
    })
  })

  it('refuses a member before anything is sent', async () => {
    mocks.verifyAdminRole.mockResolvedValue(false)
    expect((await invite()).status).toBe(403)
    expect(mocks.inviteMember).not.toHaveBeenCalled()
  })

  it('refuses a body that is not JSON, or a role that is not one of the two', async () => {
    expect((await invite('not json')).status).toBe(400)
    expect((await invite({ email: 'new@acme.com', role: 'owner' })).status).toBe(400)
    expect(mocks.inviteMember).not.toHaveBeenCalled()
  })

  it('refuses an address that is not an email', async () => {
    expect((await invite({ email: 'not-an-email' })).status).toBe(400)
    expect(mocks.inviteMember).not.toHaveBeenCalled()
  })
})

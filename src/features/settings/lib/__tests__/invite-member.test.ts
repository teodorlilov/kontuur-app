import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MS_PER_DAY } from '@/utils/constants'
import { inviteMember } from '../invite-member'

const NOW = Date.parse('2026-09-26T12:00:00Z')
const NOW_ISO = new Date(NOW).toISOString()
const OLDER = '2026-09-01T00:00:00Z'
const REQUEST = {
  agencyId: 'a1',
  inviterId: 'admin-1',
  email: 'new@acme.com',
  role: 'member' as const,
}
const INVITE_OPTIONS = {
  data: { agency_name: 'Acme', invite_tag: expect.any(String) },
  redirectTo: 'https://kontuur.app/auth/callback',
}
/** Metadata an earlier call stored when it created a login: a tag, never this call's. */
const EARLIER_CALL = { agency_name: 'Acme', invite_tag: 'an-earlier-call' }

const mocks = {
  members: vi.fn(),
  pending: vi.fn(),
  generateLink: vi.fn(),
  inviteUserByEmail: vi.fn(),
  deleteUser: vi.fn(),
  insert: vi.fn(),
  inviteRow: vi.fn(),
  update: vi.fn(),
}

/**
 * The admin client as `inviteMember` uses it: the members and agency reads, the pending-invite RPC,
 * the `team_invites` writes and the claimed row's re-read (`inviteRow`), and the auth admin's
 * probe, invite and delete. `deleteAuthIdentity` runs for real on `deleteUser`. WHY as: only the
 * chains the operation builds exist.
 */
function mockAdmin() {
  const admin = {
    rpc: (...args: unknown[]) => mocks.pending(...args),
    auth: {
      admin: {
        generateLink: (...args: unknown[]) => mocks.generateLink(...args),
        inviteUserByEmail: (...args: unknown[]) => mocks.inviteUserByEmail(...args),
        deleteUser: (id: string) => mocks.deleteUser(id),
      },
    },
    from(table: string) {
      if (table === 'users') {
        const query = {
          select: () => query,
          eq: () => query,
          then: (resolve: (value: unknown) => unknown) => resolve(mocks.members()),
        }
        return query
      }
      if (table === 'agencies') {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({ data: { name: 'Acme' }, error: null }),
        }
        return query
      }
      return {
        insert: (row: unknown) => {
          const inserted = mocks.insert(row)
          return { select: () => ({ single: () => inserted }) }
        },
        select: () => ({
          eq: (_column: string, id: string) => ({ maybeSingle: () => mocks.inviteRow(id) }),
        }),
        update: (row: unknown) => ({ eq: (_column: string, id: string) => mocks.update(row, id) }),
      }
    },
  }
  return admin as never
}

/** A login as the invite send returns it, with the metadata GoTrue stored when it was created. */
function login(id: string, createdAt: string, metadata: object = {}, confirmed = false) {
  return {
    data: {
      user: {
        id,
        created_at: createdAt,
        user_metadata: metadata,
        ...(confirmed ? { email_confirmed_at: createdAt } : {}),
      },
    },
    error: null,
  }
}

/** A login as the probe (`generateLink`) returns it: beside a link nobody sends. */
function probed(id: string, createdAt: string, metadata: object = {}, confirmed = false) {
  return {
    data: {
      properties: {
        action_link: 'https://auth.example/verify?type=invite',
        email_otp: '123456',
        hashed_token: 'hashed',
        redirect_to: INVITE_OPTIONS.redirectTo,
        verification_type: 'invite',
      },
      user: login(id, createdAt, metadata, confirmed).data.user,
    },
    error: null,
  }
}

/** A probe that creates login `id` now: GoTrue stores the probe's own metadata, its tag included. */
function probeCreates(id: string) {
  return async (params: { options: { data: object } }) => probed(id, NOW_ISO, params.options.data)
}

/** A send that creates login `id` now, storing the send's own metadata. */
function sendCreates(id: string) {
  return async (_email: string, options: { data: object }) => login(id, NOW_ISO, options.data)
}

/** The tag the `nth` call of an auth admin mock passed. */
function tagOf(mock: typeof mocks.generateLink, nth = 0): unknown {
  const args = mock.mock.calls[nth] ?? []
  const options = mock === mocks.generateLink ? args[0]?.options : args[1]
  return options?.data?.invite_tag
}

/** A pending invite row as `pending_invite_for_email` returns it, made `daysAgo` days ago. */
function pendingRow(agencyId: string, authUserId: string, daysAgo: number) {
  return {
    id: `inv-${agencyId}`,
    agency_id: agencyId,
    auth_user_id: authUserId,
    role: 'member',
    invited_by: null,
    accepted_at: null,
    created_at: new Date(NOW - daysAgo * MS_PER_DAY).toISOString(),
  }
}

/** The RPC answering each read in turn with these rows. */
function pendingReads(...reads: unknown[][]) {
  for (const rows of reads) mocks.pending.mockResolvedValueOnce({ data: rows, error: null })
}

/** The order `mock`'s `nth` call ran in, across every mock. */
function callOrder(mock: (typeof mocks)[keyof typeof mocks], nth = 0) {
  return mock.mock.invocationCallOrder[nth] ?? Number.NaN
}

/** The send reaching the login a probe created: it carries that probe's metadata, not the send's. */
const CLAIMED = login('login-new', NOW_ISO, EARLIER_CALL)
const OLD = login('login-old', OLDER, EARLIER_CALL)
const OLD_PROBE = probed('login-old', OLDER, EARLIER_CALL)
const REGISTERED = {
  message: 'A user with this email address has already been registered',
}
const SEND_FAILED = {
  ok: false,
  status: 500,
  error: 'Could not send the invite. Please try again.',
}
const SENT = { ok: true, notice: null }

/** The claimed row as its insert returns it, and as the re-read after the send finds it. */
const CLAIM_ROW = { data: { id: 'inv-new' }, error: null }

/**
 * `deleteUser` answering a delete of each of `ids` as GoTrue answers one of a login that no longer
 * exists: 404 `user_not_found` (src/lib/auth/delete-auth-identity.ts), as auth-js hands it back.
 */
function loginsGone(...ids: string[]) {
  mocks.deleteUser.mockImplementation(async (id: string) =>
    ids.includes(id)
      ? {
          data: { user: null },
          error: { message: 'User not found', status: 404, code: 'user_not_found' },
        }
      : { data: {}, error: null }
  )
}

describe('inviteMember', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://kontuur.app')
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.members.mockReturnValue({ data: [], error: null })
    mocks.pending.mockResolvedValue({ data: [], error: null })
    mocks.generateLink.mockImplementation(probeCreates('login-new'))
    mocks.inviteUserByEmail.mockResolvedValue(CLAIMED)
    mocks.deleteUser.mockResolvedValue({ data: {}, error: null })
    mocks.insert.mockResolvedValue(CLAIM_ROW)
    mocks.inviteRow.mockResolvedValue(CLAIM_ROW)
    mocks.update.mockResolvedValue({ error: null })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('claims a row for the login its probe created, then sends the one invite, its metadata only the workspace name and its own tag', async () => {
    expect(await inviteMember(mockAdmin(), REQUEST)).toEqual(SENT)
    expect(mocks.pending).toHaveBeenCalledWith('pending_invite_for_email', {
      p_email: 'new@acme.com',
    })
    expect(mocks.generateLink).toHaveBeenCalledWith({
      type: 'invite',
      email: 'new@acme.com',
      options: INVITE_OPTIONS,
    })
    expect(mocks.insert).toHaveBeenCalledWith({
      agency_id: 'a1',
      role: 'member',
      auth_user_id: 'login-new',
      invited_by: 'admin-1',
    })
    expect(mocks.inviteUserByEmail).toHaveBeenCalledOnce()
    expect(mocks.inviteUserByEmail).toHaveBeenCalledWith('new@acme.com', INVITE_OPTIONS)
    expect(tagOf(mocks.inviteUserByEmail)).not.toBe(tagOf(mocks.generateLink))
    expect(callOrder(mocks.generateLink)).toBeLessThan(callOrder(mocks.insert))
    expect(callOrder(mocks.insert)).toBeLessThan(callOrder(mocks.inviteUserByEmail))
    expect(mocks.inviteRow).toHaveBeenCalledWith('inv-new')
    expect(callOrder(mocks.inviteUserByEmail)).toBeLessThan(callOrder(mocks.inviteRow))
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('deletes the claimed login when its row is gone after the send (a workspace delete took it), so the emailed link dies too', async () => {
    mocks.inviteRow.mockResolvedValue({ data: null, error: null })
    expect(await inviteMember(mockAdmin(), REQUEST)).toEqual(SEND_FAILED)
    expect(mocks.inviteUserByEmail).toHaveBeenCalledOnce()
    expect(mocks.deleteUser).toHaveBeenCalledOnce()
    expect(mocks.deleteUser).toHaveBeenCalledWith('login-new')
    expect(callOrder(mocks.inviteRow)).toBeLessThan(callOrder(mocks.deleteUser))
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[team:invite]'))
  })

  it('deletes the claimed login when its row cannot be re-read', async () => {
    mocks.inviteRow.mockResolvedValue({ data: null, error: { message: 'timeout' } })
    expect(await inviteMember(mockAdmin(), REQUEST)).toEqual(SEND_FAILED)
    expect(mocks.deleteUser).toHaveBeenCalledWith('login-new')
    expect(console.error).toHaveBeenCalledOnce()
  })

  it('updates the row of an invite sent again, rather than adding one', async () => {
    pendingReads([pendingRow('a1', 'login-old', 10)])
    mocks.generateLink.mockResolvedValue(OLD_PROBE)
    mocks.inviteUserByEmail.mockResolvedValue(OLD)
    const result = await inviteMember(mockAdmin(), { ...REQUEST, role: 'admin' })
    expect(result).toEqual(SENT)
    expect(mocks.inviteUserByEmail).toHaveBeenCalledOnce()
    expect(mocks.update).toHaveBeenCalledWith(
      { role: 'admin', invited_by: 'admin-1', created_at: expect.any(String) },
      'inv-a1'
    )
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('deletes an older unconfirmed login no invite names, maybe an attacker’s signup, then sends one invite to the new login', async () => {
    mocks.generateLink.mockResolvedValueOnce(OLD_PROBE)
    expect(await inviteMember(mockAdmin(), REQUEST)).toEqual(SENT)
    expect(mocks.deleteUser).toHaveBeenCalledWith('login-old')
    expect(mocks.generateLink).toHaveBeenCalledTimes(2)
    expect(callOrder(mocks.deleteUser)).toBeLessThan(callOrder(mocks.generateLink, 1))
    expect(mocks.inviteUserByEmail).toHaveBeenCalledOnce()
    expect(callOrder(mocks.deleteUser)).toBeLessThan(callOrder(mocks.inviteUserByEmail))
    await expect(mocks.inviteUserByEmail.mock.results[0]?.value).resolves.not.toMatchObject({
      data: { user: { id: 'login-old' } },
    })
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ auth_user_id: 'login-new' })
    )
    expect(callOrder(mocks.insert)).toBeLessThan(callOrder(mocks.inviteUserByEmail))
  })

  it('takes a login someone else created seconds before the probe for an older one: its tag, not a clock, decides', async () => {
    const seconds = new Date(NOW - 3_000).toISOString()
    mocks.generateLink.mockResolvedValueOnce(probed('login-early', seconds, { agency_name: 'X' }))
    expect(await inviteMember(mockAdmin(), REQUEST)).toEqual(SENT)
    expect(mocks.insert).not.toHaveBeenCalledWith(
      expect.objectContaining({ auth_user_id: 'login-early' })
    )
    expect(mocks.deleteUser).toHaveBeenCalledWith('login-early')
    expect(tagOf(mocks.generateLink, 1)).not.toBe(tagOf(mocks.generateLink, 0))
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ auth_user_id: 'login-new' })
    )
  })

  it('refuses, deleting nothing, when the re-read finds a racing workspace claimed the fresh login first', async () => {
    pendingReads([], [pendingRow('a9', 'login-a9', 0)])
    mocks.generateLink.mockResolvedValue(
      probed('login-a9', NOW_ISO, { agency_name: 'Nine', invite_tag: 'a9-probe' })
    )
    expect(await inviteMember(mockAdmin(), REQUEST)).toEqual({
      ok: false,
      status: 409,
      error: 'This email has a pending invite to another workspace.',
    })
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('refuses, deleting and sending nothing, when the re-read finds another live invite', async () => {
    pendingReads([], [pendingRow('a9', 'login-old', 1)])
    mocks.generateLink.mockResolvedValue(OLD_PROBE)
    expect(await inviteMember(mockAdmin(), REQUEST)).toMatchObject({ ok: false, status: 409 })
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('answers as a resend when the re-read finds this workspace’s invite', async () => {
    pendingReads([], [pendingRow('a1', 'login-old', 1)])
    mocks.generateLink.mockResolvedValue(OLD_PROBE)
    mocks.inviteUserByEmail.mockResolvedValue(OLD)
    expect(await inviteMember(mockAdmin(), REQUEST)).toEqual(SENT)
    expect(mocks.inviteUserByEmail).toHaveBeenCalledOnce()
    expect(mocks.update).toHaveBeenCalledWith(
      { role: 'member', invited_by: 'admin-1', created_at: expect.any(String) },
      'inv-a1'
    )
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('proceeds past another workspace’s invite older than the hold, taking its login back', async () => {
    const lapsed = pendingRow('a9', 'login-old', 8)
    pendingReads([lapsed], [lapsed])
    mocks.generateLink.mockResolvedValueOnce(OLD_PROBE)
    expect(await inviteMember(mockAdmin(), REQUEST)).toEqual(SENT)
    expect(mocks.deleteUser).toHaveBeenCalledWith('login-old')
    expect(mocks.inviteUserByEmail).toHaveBeenCalledOnce()
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ auth_user_id: 'login-new' })
    )
  })

  it('refuses an address another workspace’s live invite holds, sending nothing', async () => {
    pendingReads([pendingRow('a9', 'login-old', 6)])
    expect(await inviteMember(mockAdmin(), REQUEST)).toEqual({
      ok: false,
      status: 409,
      error: 'This email has a pending invite to another workspace.',
    })
    expect(mocks.generateLink).not.toHaveBeenCalled()
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('fails, sending nothing, when the second probe returns a login it did not create, a sign-up that slipped in after the delete', async () => {
    mocks.generateLink
      .mockResolvedValueOnce(OLD_PROBE)
      .mockResolvedValueOnce(probed('login-signup', NOW_ISO, { businessName: 'Mine' }))
    expect(await inviteMember(mockAdmin(), REQUEST)).toMatchObject({ ok: false, status: 500 })
    expect(mocks.deleteUser).toHaveBeenCalledOnce()
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('sends nothing when the older login cannot be deleted', async () => {
    mocks.generateLink.mockResolvedValue(OLD_PROBE)
    mocks.deleteUser.mockResolvedValue({ data: {}, error: { message: 'still referenced' } })
    expect(await inviteMember(mockAdmin(), REQUEST)).toMatchObject({ ok: false, status: 500 })
    expect(mocks.generateLink).toHaveBeenCalledOnce()
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  describe('when the send does not reach the login it claimed', () => {
    it('deletes the claimed login when the send fails, its row cascading with it (migration 20260861)', async () => {
      mocks.inviteUserByEmail.mockResolvedValue({
        data: { user: null },
        error: { message: 'Email rate limit exceeded' },
      })
      expect(await inviteMember(mockAdmin(), REQUEST)).toEqual({
        ok: false,
        status: 500,
        error: 'Email rate limit exceeded',
      })
      expect(callOrder(mocks.insert)).toBeLessThan(callOrder(mocks.inviteUserByEmail))
      expect(mocks.deleteUser).toHaveBeenCalledOnce()
      expect(mocks.deleteUser).toHaveBeenCalledWith('login-new')
    })

    it('fails, logged, rather than refuses when the send finds the address registered: the login a refusal names is deleted', async () => {
      mocks.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: REGISTERED })
      expect(await inviteMember(mockAdmin(), REQUEST)).toEqual(SEND_FAILED)
      expect(mocks.deleteUser).toHaveBeenCalledWith('login-new')
      expect(console.error).toHaveBeenCalledOnce()
      expect(console.error).toHaveBeenCalledWith(
        expect.stringMatching(/^\[team:invite\] .*login-new/)
      )
    })

    it('deletes a login the send created after the probed one vanished, and the claimed one, logging no user_not_found', async () => {
      loginsGone('login-new')
      mocks.inviteUserByEmail.mockImplementation(sendCreates('login-other'))
      expect(await inviteMember(mockAdmin(), REQUEST)).toEqual(SEND_FAILED)
      expect(mocks.deleteUser).toHaveBeenCalledWith('login-other')
      expect(mocks.deleteUser).toHaveBeenCalledWith('login-new')
      expect(mocks.update).not.toHaveBeenCalled()
      expect(console.error).toHaveBeenCalledOnce()
      expect(console.error).toHaveBeenCalledWith(
        '[team:invite] the send named login login-other, not login-new'
      )
    })

    it('leaves a login the send did not create, deleting only the claimed one', async () => {
      loginsGone('login-new')
      mocks.inviteUserByEmail.mockResolvedValue(login('login-other', NOW_ISO, EARLIER_CALL))
      expect(await inviteMember(mockAdmin(), REQUEST)).toEqual(SEND_FAILED)
      expect(mocks.deleteUser).toHaveBeenCalledOnce()
      expect(mocks.deleteUser).toHaveBeenCalledWith('login-new')
      expect(mocks.update).not.toHaveBeenCalled()
      expect(console.error).toHaveBeenCalledOnce()
    })
  })

  it('records no resend when its send creates another login, deleting only that one, never the invitee’s', async () => {
    pendingReads([pendingRow('a1', 'login-old', 10)])
    mocks.generateLink.mockResolvedValue(OLD_PROBE)
    mocks.inviteUserByEmail.mockImplementation(sendCreates('login-other'))
    expect(await inviteMember(mockAdmin(), REQUEST)).toMatchObject({ ok: false, status: 500 })
    expect(mocks.deleteUser).toHaveBeenCalledOnce()
    expect(mocks.deleteUser).toHaveBeenCalledWith('login-other')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each(['42501', '23505'])(
    'takes back a login this invite created when its row cannot be written (%s), a unique violation too, since only this call inserts a row for that login',
    async (code) => {
      mocks.insert.mockResolvedValue({ data: null, error: { code, message: 'insert failed' } })
      expect(await inviteMember(mockAdmin(), REQUEST)).toEqual({
        ok: false,
        status: 500,
        error: 'Could not record the invite. Please try again.',
      })
      expect(mocks.deleteUser).toHaveBeenCalledWith('login-new')
      expect(mocks.inviteUserByEmail).not.toHaveBeenCalled()
      expect(mocks.pending).toHaveBeenCalledOnce()
    }
  )

  it('answers ok with a notice when a resend’s email went out but its row cannot be updated, deleting nothing', async () => {
    pendingReads([pendingRow('a1', 'login-old', 2)])
    mocks.generateLink.mockResolvedValue(OLD_PROBE)
    mocks.inviteUserByEmail.mockResolvedValue(OLD)
    mocks.update.mockResolvedValue({ error: { message: 'update failed' } })
    expect(await inviteMember(mockAdmin(), REQUEST)).toEqual({
      ok: true,
      notice:
        'The invite was sent, but the new role could not be saved. Send it again to change the role.',
    })
    expect(mocks.inviteUserByEmail).toHaveBeenCalledOnce()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledOnce()
  })

  it('refuses a login that has confirmed its email, sending, recording and deleting nothing', async () => {
    pendingReads([pendingRow('a1', 'login-old', 2)])
    mocks.generateLink.mockResolvedValue(probed('login-old', OLDER, EARLIER_CALL, true))
    expect(await inviteMember(mockAdmin(), REQUEST)).toEqual({
      ok: false,
      status: 409,
      error: 'This email already has an account. They cannot be invited again.',
    })
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('refuses an address the probe finds already registered, sending nothing', async () => {
    mocks.generateLink.mockResolvedValue({
      data: { properties: null, user: null },
      error: REGISTERED,
    })
    expect(await inviteMember(mockAdmin(), REQUEST)).toEqual({
      ok: false,
      status: 409,
      error: 'This email already has an account. They cannot be invited again.',
    })
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('refuses a resend whose send finds the address registered, recording nothing', async () => {
    pendingReads([pendingRow('a1', 'login-old', 2)])
    mocks.generateLink.mockResolvedValue(OLD_PROBE)
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: REGISTERED })
    expect(await inviteMember(mockAdmin(), REQUEST)).toMatchObject({ ok: false, status: 409 })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('fails, sending nothing, when the probe fails', async () => {
    mocks.generateLink.mockResolvedValue({
      data: { properties: null, user: null },
      error: { message: 'Database error finding user' },
    })
    expect(await inviteMember(mockAdmin(), REQUEST)).toEqual({
      ok: false,
      status: 500,
      error: 'Database error finding user',
    })
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('refuses an address already on the team, probing and sending nothing', async () => {
    mocks.members.mockReturnValue({ data: [{ id: 'member-1' }], error: null })
    expect(await inviteMember(mockAdmin(), REQUEST)).toEqual({
      ok: false,
      status: 409,
      error: 'This email is already a team member',
    })
    expect(mocks.generateLink).not.toHaveBeenCalled()
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled()
  })
})

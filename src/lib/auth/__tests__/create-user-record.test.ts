import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUserRecord } from '../create-user-record'

/**
 * Account provisioning writes exactly two rows — an agency and a user — for a signup, and one user
 * row for an invitee, joined through a pending `team_invites` row and never through the login's own
 * metadata, which anyone can write at sign-up.
 *
 * Solo used to get a third: a name-only client inserted here, which was the state the whole
 * first-run gate exists to remove (the client is created by the onboarding flow instead, so
 * that "a client exists" means "setup was completed"). This pins that nothing in this
 * function writes `clients` any more.
 */
interface Write {
  table: string
  row: Record<string, unknown>
}

interface Invite {
  id: string
  agency_id: string
  role: string
  auth_user_id: string
  accepted_at: string | null
}

/**
 * Records every insert and update; the users lookup answers `existing`, the invite lookup `invite`
 * when it passes every `eq` and `is` filter the function applies, and the agency insert a fixed id.
 * WHY as: only the chains the function builds exist.
 */
function recordingAdmin(
  existing: { agency_id: string } | null = null,
  invite: Invite | null = null
) {
  const writes: Write[] = []
  const tables: string[] = []
  const admin = {
    from(table: string) {
      tables.push(table)
      const filters: Array<[string, unknown]> = []
      const passes = (row: Invite | null) =>
        row !== null && filters.every(([column, value]) => row[column as keyof Invite] === value)
      const lookup = {
        eq: (column: string, value: unknown) => (filters.push([column, value]), lookup),
        is: (column: string, value: unknown) => (filters.push([column, value]), lookup),
        maybeSingle: async () => ({
          data: table === 'team_invites' ? (passes(invite) ? invite : null) : existing,
          error: null,
        }),
      }
      return {
        select: () => lookup,
        insert(row: Record<string, unknown>) {
          writes.push({ table, row })
          return {
            select: () => ({
              single: async () => ({ data: { id: 'agency-1' }, error: null }),
            }),
            then: (resolve: (result: { error: null }) => unknown) => resolve({ error: null }),
          }
        },
        update(row: Record<string, unknown>) {
          writes.push({ table, row })
          return { eq: async () => ({ error: null }) }
        },
      }
    },
  }
  return { admin: admin as never, writes, tables }
}

const USER = { id: 'user-1', email: 'owner@acme.com' }

/** Signups here happen at noon on 26 September; the trial ends `TRIAL_DAYS` later. */
const TRIAL_END = '2026-10-10T12:00:00.000Z'

describe('createUserRecord', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-09-26T12:00:00Z'), toFake: ['Date'] })
  })
  afterEach(() => vi.useRealTimers())

  it('creates an agency and a user for a solo signup — and no client', async () => {
    const recorder = recordingAdmin()
    const result = await createUserRecord(recorder.admin, {
      ...USER,
      user_metadata: { businessName: 'Acme', mode: 'solo' },
    })

    expect(result).toEqual({ agencyId: 'agency-1', isInvited: false })
    expect(recorder.writes).toEqual([
      { table: 'agencies', row: { name: 'Acme', mode: 'solo', trial_ends_at: TRIAL_END } },
      {
        table: 'users',
        row: { id: 'user-1', agency_id: 'agency-1', email: USER.email, role: 'admin' },
      },
    ])
    expect(recorder.tables).not.toContain('clients')
  })

  it('creates the same two rows for an agency signup', async () => {
    const recorder = recordingAdmin()
    await createUserRecord(recorder.admin, {
      ...USER,
      user_metadata: { businessName: 'Acme Agency', mode: 'agency' },
    })

    expect(recorder.writes.map((write) => write.table)).toEqual(['agencies', 'users'])
    expect(recorder.writes[0]?.row).toEqual({
      name: 'Acme Agency',
      mode: 'agency',
      trial_ends_at: TRIAL_END,
    })
  })

  it('writes nothing for a user who already has a row', async () => {
    const recorder = recordingAdmin({ agency_id: 'agency-existing' })
    const result = await createUserRecord(recorder.admin, {
      ...USER,
      user_metadata: { businessName: 'Acme', mode: 'solo' },
    })

    expect(result).toEqual({ agencyId: 'agency-existing', isInvited: false })
    expect(recorder.writes).toEqual([])
  })

  it('joins a pending invite’s workspace with its role, and consumes the invite', async () => {
    const recorder = recordingAdmin(null, {
      id: 'inv-1',
      agency_id: 'agency-host',
      role: 'admin',
      auth_user_id: USER.id,
      accepted_at: null,
    })
    const result = await createUserRecord(recorder.admin, {
      ...USER,
      user_metadata: { agency_name: 'Host' },
    })

    expect(result).toEqual({ agencyId: 'agency-host', isInvited: true })
    expect(recorder.writes).toEqual([
      {
        table: 'users',
        row: { id: 'user-1', agency_id: 'agency-host', email: USER.email, role: 'admin' },
      },
      { table: 'team_invites', row: { accepted_at: '2026-09-26T12:00:00.000Z' } },
    ])
  })

  it('never joins the workspace or takes the role a login’s metadata names, since anyone can write it at sign-up', async () => {
    const recorder = recordingAdmin()
    const result = await createUserRecord(recorder.admin, {
      ...USER,
      user_metadata: {
        businessName: 'Forger',
        mode: 'agency',
        invited_agency_id: 'agency-victim',
        role: 'admin',
      },
    })

    expect(result).toEqual({ agencyId: 'agency-1', isInvited: false })
    expect(recorder.writes.map((write) => write.row.agency_id ?? write.row.name)).toEqual([
      'Forger',
      'agency-1',
    ])
  })

  it('gives a login whose invite is already accepted — a removed member’s surviving login — no membership', async () => {
    const recorder = recordingAdmin(null, {
      id: 'inv-1',
      agency_id: 'agency-host',
      role: 'admin',
      auth_user_id: USER.id,
      accepted_at: '2026-09-01T00:00:00.000Z',
    })
    await expect(
      createUserRecord(recorder.admin, { ...USER, user_metadata: { agency_name: 'Host' } })
    ).rejects.toThrow('signup metadata is missing a business name or mode')
    expect(recorder.writes).toEqual([])
  })

  it('refuses a signup whose metadata has no business name', async () => {
    const recorder = recordingAdmin()
    await expect(
      createUserRecord(recorder.admin, { ...USER, user_metadata: { mode: 'solo' } })
    ).rejects.toThrow('signup metadata is missing a business name or mode')
    expect(recorder.writes).toEqual([])
  })
})

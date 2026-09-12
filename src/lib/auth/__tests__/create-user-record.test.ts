import { beforeEach, describe, expect, it } from 'vitest'
import { createUserRecord } from '../create-user-record'

/**
 * Account provisioning writes exactly two rows — an agency and a user — in both modes.
 *
 * Solo used to get a third: a name-only client inserted here, which was the state the whole
 * first-run gate exists to remove (the client is created by the onboarding flow instead, so
 * that "a client exists" means "setup was completed"). This pins that nothing in this
 * function writes `clients` any more, and that the branches around it did not move.
 */
interface Write {
  table: string
  row: Record<string, unknown>
}

/** Records every insert; the agency insert answers `.select().single()` with a fixed id. */
function recordingAdmin(existing: { agency_id: string } | null = null) {
  const writes: Write[] = []
  const tables: string[] = []
  const admin = {
    from(table: string) {
      tables.push(table)
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }),
        }),
        insert(row: Record<string, unknown>) {
          writes.push({ table, row })
          return {
            select: () => ({
              single: async () => ({ data: { id: 'agency-1' }, error: null }),
            }),
            then: (resolve: (result: { error: null }) => unknown) => resolve({ error: null }),
          }
        },
      }
    },
  }
  return { admin: admin as never, writes, tables }
}

const USER = { id: 'user-1', email: 'owner@acme.com' }

describe('createUserRecord', () => {
  let recorder: ReturnType<typeof recordingAdmin>

  beforeEach(() => {
    recorder = recordingAdmin()
  })

  it('creates an agency and a user for a solo signup — and no client', async () => {
    const result = await createUserRecord(recorder.admin, {
      ...USER,
      user_metadata: { businessName: 'Acme', mode: 'solo' },
    })

    expect(result).toEqual({ agencyId: 'agency-1', isInvited: false })
    expect(recorder.writes).toEqual([
      { table: 'agencies', row: { name: 'Acme', mode: 'solo' } },
      {
        table: 'users',
        row: { id: 'user-1', agency_id: 'agency-1', email: USER.email, role: 'admin' },
      },
    ])
    expect(recorder.tables).not.toContain('clients')
  })

  it('creates the same two rows for an agency signup', async () => {
    await createUserRecord(recorder.admin, {
      ...USER,
      user_metadata: { businessName: 'Acme Agency', mode: 'agency' },
    })

    expect(recorder.writes.map((write) => write.table)).toEqual(['agencies', 'users'])
    expect(recorder.writes[0]?.row).toEqual({ name: 'Acme Agency', mode: 'agency' })
  })

  it('writes nothing for a user who already has a row', async () => {
    recorder = recordingAdmin({ agency_id: 'agency-existing' })

    const result = await createUserRecord(recorder.admin, {
      ...USER,
      user_metadata: { businessName: 'Acme', mode: 'solo' },
    })

    expect(result).toEqual({ agencyId: 'agency-existing', isInvited: false })
    expect(recorder.writes).toEqual([])
  })

  it('joins an invited user to the existing agency as a member', async () => {
    const result = await createUserRecord(recorder.admin, {
      ...USER,
      user_metadata: { invited_agency_id: 'agency-host' },
    })

    expect(result).toEqual({ agencyId: 'agency-host', isInvited: true })
    expect(recorder.writes).toEqual([
      {
        table: 'users',
        row: { id: 'user-1', agency_id: 'agency-host', email: USER.email, role: 'member' },
      },
    ])
  })

  it('refuses a signup whose metadata has no business name', async () => {
    await expect(
      createUserRecord(recorder.admin, { ...USER, user_metadata: { mode: 'solo' } })
    ).rejects.toThrow('signup metadata is missing a business name or mode')
    expect(recorder.writes).toEqual([])
  })
})

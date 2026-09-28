import { describe, expect, it, vi } from 'vitest'
import type { AdminClient } from '@/lib/supabase/admin'

vi.mock('@/lib/visual/queries', () => ({ upsertVisualIdentity: vi.fn() }))

import { takeBackClient, unprovisionClient } from '../provision-client'

/** The delete's table and predicates. WHY as: only `from/delete/eq` and awaiting the chain exist. */
function recordingAdmin(error: { code?: string; message: string } | null = null) {
  const seen = { table: '', predicates: {} as Record<string, string> }
  const chain = {
    delete: () => chain,
    eq: (column: string, value: string) => {
      seen.predicates[column] = value
      return chain
    },
    then: (resolve: (r: { error: typeof error }) => unknown) => resolve({ error }),
  }
  const admin = {
    from: (table: string) => {
      seen.table = table
      return chain
    },
  }
  return { admin: admin as unknown as AdminClient, seen }
}

describe('unprovisionClient', () => {
  it('deletes the one client row by id and by the caller’s agency, never by id alone (the admin client bypasses RLS)', async () => {
    const { admin, seen } = recordingAdmin()
    expect(await unprovisionClient(admin, 'c1', 'a1')).toBeNull()
    expect(seen).toEqual({ table: 'clients', predicates: { id: 'c1', agency_id: 'a1' } })
  })

  it('hands the database error back for the caller to answer', async () => {
    const { admin } = recordingAdmin({ code: '23503', message: 'violates foreign key constraint' })
    expect(await unprovisionClient(admin, 'c1', 'a1')).toEqual({
      code: '23503',
      message: 'violates foreign key constraint',
    })
  })
})

describe('takeBackClient', () => {
  it('removes the client and logs nothing when the delete succeeds', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { admin, seen } = recordingAdmin()
    await takeBackClient(admin, 'c1', 'a1')
    expect(seen).toEqual({ table: 'clients', predicates: { id: 'c1', agency_id: 'a1' } })
    expect(errorLog).not.toHaveBeenCalled()
  })

  it('logs a client that could not be removed as orphaned', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { admin } = recordingAdmin({ message: 'connection reset' })
    await takeBackClient(admin, 'c1', 'a1')
    expect(errorLog).toHaveBeenCalledWith(
      '[clients:create] client c1 could not be removed and is orphaned:',
      { message: 'connection reset' }
    )
  })
})

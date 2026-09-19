import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The most destructive action in the product, executed rather than text-scanned. What is pinned:
 * the agency is the caller's own and the delete is scoped to it; every refusal (member, open
 * subscription, wrong name) happens before anything is read or deleted; the 23503 branch names
 * its migration; and after the one row delete the identities, the sweep and the busts follow —
 * with `'max'` only and no `revalidatePath`, the constraint the action's doc explains.
 */

const AGENCY_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

const mocks = vi.hoisted(() => ({
  resolveActionAuth: vi.fn(),
  verifyAdminRole: vi.fn(),
  fetchAgencyById: vi.fn(),
  fetchTeamMembersByAgency: vi.fn(),
  getCachedAgencyClients: vi.fn(),
  revalidateClientData: vi.fn(),
  deleteAuthIdentity: vi.fn(),
  sweepClientStorage: vi.fn(),
  createAdminSupabaseClient: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/auth/helpers', () => ({
  resolveActionAuth: mocks.resolveActionAuth,
  verifyAdminRole: mocks.verifyAdminRole,
  USER_RECORD_TAG: 'user-record',
}))
vi.mock('@/lib/auth/delete-auth-identity', () => ({
  deleteAuthIdentity: mocks.deleteAuthIdentity,
}))
vi.mock('@/lib/clients/sweep-client-storage', () => ({
  sweepClientStorage: mocks.sweepClientStorage,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: mocks.createAdminSupabaseClient,
}))
vi.mock('@/lib/queries/db', () => ({
  fetchAgencyById: mocks.fetchAgencyById,
  fetchTeamMembersByAgency: mocks.fetchTeamMembersByAgency,
}))
vi.mock('@/lib/queries/cache', () => ({
  getCachedAgencyClients: mocks.getCachedAgencyClients,
  revalidateClientData: mocks.revalidateClientData,
}))
vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
  revalidatePath: mocks.revalidatePath,
}))

import { deleteWorkspace } from '../workspace-actions'

/** A trial agencies row as the settings read returns it; `paid` makes it a live subscription. */
function agency(overrides: Record<string, unknown> = {}) {
  return {
    id: AGENCY_ID,
    name: 'About Social Media',
    plan: 'trial',
    mode: 'agency',
    timezone: 'Europe/Sofia',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: null,
    subscription_quantity: null,
    trial_ends_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    past_due_since: null,
    ...overrides,
  }
}
const PAID = {
  plan: 'pro',
  stripe_customer_id: 'cus_1',
  stripe_subscription_id: 'sub_1',
  subscription_status: 'active',
  subscription_quantity: 2,
  current_period_start: '2026-09-01T00:00:00Z',
  current_period_end: '2026-10-01T00:00:00Z',
}

/** Records the one delete's predicates. */
function recordingAdmin(error: { code?: string; message: string } | null = null) {
  const predicates: Record<string, string> = {}
  const tables: string[] = []
  const chain = {
    delete: () => chain,
    eq: (column: string, value: string) => {
      predicates[column] = value
      return chain
    },
    then: (resolve: (r: { error: typeof error }) => unknown) => resolve({ error }),
  }
  const client = {
    from: (table: string) => {
      tables.push(table)
      return chain
    },
  }
  return { client: client as never, predicates, tables }
}

describe('deleteWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.resolveActionAuth.mockResolvedValue({
      ok: true,
      supabase: {},
      agencyId: AGENCY_ID,
      userId: 'user-1',
      role: 'admin',
    })
    mocks.verifyAdminRole.mockResolvedValue(true)
    mocks.fetchAgencyById.mockResolvedValue(agency())
    mocks.getCachedAgencyClients.mockResolvedValue([{ id: 'client-1' }, { id: 'client-2' }])
    mocks.fetchTeamMembersByAgency.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }])
    mocks.deleteAuthIdentity.mockResolvedValue(true)
    mocks.sweepClientStorage.mockResolvedValue({ images: 4, files: 1 })
    mocks.createAdminSupabaseClient.mockReturnValue(recordingAdmin().client)
  })

  it('refuses a member on the fresh role read, before reading the workspace', async () => {
    mocks.verifyAdminRole.mockResolvedValue(false)
    expect(await deleteWorkspace('About Social Media')).toEqual({
      ok: false,
      error: 'Only admins can delete the workspace.',
    })
    expect(mocks.fetchAgencyById).not.toHaveBeenCalled()
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled()
  })

  it('refuses while a subscription is open, with the cancel-first sentence, and touches nothing', async () => {
    mocks.fetchAgencyById.mockResolvedValue(agency(PAID))
    const result = await deleteWorkspace('About Social Media')
    expect(result).toEqual({
      ok: false,
      error:
        'Cancel your plan first, under Plan & billing. You keep access until it ends, and can delete the workspace right after.',
    })
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled()
    expect(mocks.deleteAuthIdentity).not.toHaveBeenCalled()
  })

  it('allows it once the plan is set to end', async () => {
    mocks.fetchAgencyById.mockResolvedValue(agency({ ...PAID, cancel_at_period_end: true }))
    expect(await deleteWorkspace('About Social Media')).toEqual({ ok: true, data: undefined })
  })

  it('refuses a name that does not match, ignoring case and spacing when it does', async () => {
    expect(await deleteWorkspace('About Social')).toEqual({
      ok: false,
      error: 'The name does not match.',
    })
    expect(await deleteWorkspace('   ')).toEqual({ ok: false, error: 'The name does not match.' })
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled()
    expect(await deleteWorkspace('  about  social media ')).toEqual({ ok: true, data: undefined })
  })

  it('deletes the one row, scoped to the caller’s agency, then the identities, the storage and the caches', async () => {
    const admin = recordingAdmin()
    mocks.createAdminSupabaseClient.mockReturnValue(admin.client)

    expect(await deleteWorkspace('About Social Media')).toEqual({ ok: true, data: undefined })

    expect(admin.tables).toEqual(['agencies'])
    expect(admin.predicates).toEqual({ id: AGENCY_ID })
    expect(mocks.deleteAuthIdentity.mock.calls).toEqual([
      [admin.client, 'user-1', 'workspace:delete'],
      [admin.client, 'user-2', 'workspace:delete'],
    ])
    expect(mocks.sweepClientStorage.mock.calls.map(([id]) => id)).toEqual(['client-1', 'client-2'])
    expect(mocks.revalidateTag.mock.calls).toEqual([
      ['user-record', 'max'],
      ['agencies', 'max'],
    ])
    expect(mocks.revalidateClientData).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('names the missing migration when a foreign key still blocks the delete, and sweeps nothing', async () => {
    mocks.createAdminSupabaseClient.mockReturnValue(
      recordingAdmin({ code: '23503', message: 'violates foreign key constraint' }).client
    )
    expect(await deleteWorkspace('About Social Media')).toEqual({
      ok: false,
      error: 'Cannot delete: the database is missing migration 20260856.',
    })
    expect(mocks.deleteAuthIdentity).not.toHaveBeenCalled()
    expect(mocks.sweepClientStorage).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it('reports any other database failure plainly', async () => {
    mocks.createAdminSupabaseClient.mockReturnValue(
      recordingAdmin({ message: 'connection reset' }).client
    )
    expect(await deleteWorkspace('About Social Media')).toEqual({
      ok: false,
      error: 'Could not delete the workspace. Please try again.',
    })
  })

  it('still answers ok when an identity survives — the rows are gone either way', async () => {
    mocks.deleteAuthIdentity.mockResolvedValueOnce(false)
    expect(await deleteWorkspace('About Social Media')).toEqual({ ok: true, data: undefined })
    expect(mocks.deleteAuthIdentity).toHaveBeenCalledTimes(2)
  })
})

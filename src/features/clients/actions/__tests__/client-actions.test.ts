import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * The first executable test of a server action in this repo, for the most
 * destructive one: `deleteClient` removes ~18 tables' worth of rows and two
 * storage prefixes, with no undo.
 *
 * It had no coverage at all. `delete-client-dialog.test.tsx` mocks the action
 * away to test a component, and `action-validation.test.ts` is a text scan —
 * neither has ever executed this function. What that left unguarded is the
 * `agency_id` predicate: the delete runs on the ADMIN client, which bypasses
 * RLS, so that one `.eq` is the only thing standing between the statement and
 * another agency's client. Nothing would have failed if it were dropped.
 *
 * The other three assertions pin decisions that read as arbitrary and are not:
 * the 23503 branch exists because a database missing migration 20260820 is
 * indistinguishable from a transient fault without it; the storage sweep runs
 * AFTER the rows because sweeping first would strip a live client's images if
 * the delete then failed; and the revalidation set has to include the analytics
 * tag, since deleteClient is a writer of those tables (via the cascade) and was
 * the only such writer that never busted it.
 */

const CLIENT_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const AGENCY_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

const { mocks } = vi.hoisted(() => ({
  mocks: {
    resolveActionAuth: vi.fn(),
    fetchClientWithOwnership: vi.fn(),
    verifyClientOwnership: vi.fn(),
    createAdminSupabaseClient: vi.fn(),
    removeStoragePrefix: vi.fn(),
    revalidateTag: vi.fn(),
    revalidatePath: vi.fn(),
  },
}))

vi.mock('@/lib/auth/helpers', () => ({
  resolveActionAuth: mocks.resolveActionAuth,
  fetchClientWithOwnership: mocks.fetchClientWithOwnership,
  verifyClientOwnership: mocks.verifyClientOwnership,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: mocks.createAdminSupabaseClient,
}))
vi.mock('@/features/assets/lib/storage', () => ({
  removeStoragePrefix: mocks.removeStoragePrefix,
}))
// unstable_cache is required, not incidental: the module imports IG_METRICS_TAG
// from report-data.ts, which calls unstable_cache at module scope — without it
// the file throws on import and every test here fails before it runs.
vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
  revalidatePath: mocks.revalidatePath,
  unstable_cache: (fn: unknown) => fn,
}))

/** Records the predicates the delete applies, and the order of the calls. */
function recordingAdmin(error: { code?: string; message: string } | null = null) {
  const predicates: Record<string, string> = {}
  const order: string[] = []
  const chain = {
    delete: () => {
      order.push('delete')
      return chain
    },
    eq: (column: string, value: string) => {
      predicates[column] = value
      return chain
    },
    then: (resolve: (r: { error: typeof error }) => unknown) => resolve({ error }),
  }
  return { client: { from: () => chain } as never, predicates, order }
}

describe('deleteClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveActionAuth.mockResolvedValue({
      ok: true,
      supabase: {} as never,
      agencyId: AGENCY_ID,
      userId: 'user-1',
    })
    mocks.fetchClientWithOwnership.mockResolvedValue({ id: CLIENT_ID, name: 'Dr Kamberova' })
    mocks.removeStoragePrefix.mockImplementation(async () => {
      return 0
    })
  })

  it('scopes the delete by agency, not by client id alone', async () => {
    const admin = recordingAdmin()
    mocks.createAdminSupabaseClient.mockReturnValue(admin.client)

    const { deleteClient } = await import('../client-actions')
    const result = await deleteClient(CLIENT_ID)

    expect(result).toEqual({ ok: true, data: undefined })
    // Both, always. The admin client bypasses RLS, so dropping agency_id would
    // let a forged id reach another agency's row.
    expect(admin.predicates.id).toBe(CLIENT_ID)
    expect(admin.predicates.agency_id).toBe(AGENCY_ID)
  })

  it('rejects a non-uuid before touching the database', async () => {
    mocks.createAdminSupabaseClient.mockReturnValue(recordingAdmin().client)

    const { deleteClient } = await import('../client-actions')
    const result = await deleteClient('client-1')

    expect(result.ok).toBe(false)
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled()
  })

  it('names the missing migration when a foreign key still blocks the delete', async () => {
    mocks.createAdminSupabaseClient.mockReturnValue(
      recordingAdmin({ code: '23503', message: 'violates foreign key constraint' }).client
    )

    const { deleteClient } = await import('../client-actions')
    const result = await deleteClient(CLIENT_ID)

    expect(result).toEqual({
      ok: false,
      error: 'Cannot delete: the database is missing migration 20260820.',
    })
  })

  it('leaves stored files alone when the row delete fails', async () => {
    mocks.createAdminSupabaseClient.mockReturnValue(
      recordingAdmin({ message: 'connection reset' }).client
    )

    const { deleteClient } = await import('../client-actions')
    const result = await deleteClient(CLIENT_ID)

    expect(result.ok).toBe(false)
    // Sweeping before the rows are gone would strip a live client's images.
    expect(mocks.removeStoragePrefix).not.toHaveBeenCalled()
  })

  it('busts the analytics cache alongside the roster caches', async () => {
    mocks.createAdminSupabaseClient.mockReturnValue(recordingAdmin().client)

    const { deleteClient } = await import('../client-actions')
    await deleteClient(CLIENT_ID)

    const tags = mocks.revalidateTag.mock.calls.map(([tag]) => tag)
    // ig-metrics is the one this action skipped: the cascade removes the rows
    // the analytics report and its narrative were built from.
    expect(tags).toContain('ig-metrics')
    expect(tags).toContain('agency-clients')
    expect(tags).toContain('client-post-stats')
  })
})

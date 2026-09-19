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
 * the delete then failed; and the cache busts go through the shared
 * `revalidateClientData`, whose tag list (the analytics tag included — deleteClient
 * is a writer of those tables via the cascade, and was the one writer that never
 * busted it) is pinned on the helper's own test.
 */

const CLIENT_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const AGENCY_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

const { mocks } = vi.hoisted(() => ({
  mocks: {
    resolveActionAuth: vi.fn(),
    fetchClientWithOwnership: vi.fn(),
    verifyClientOwnership: vi.fn(),
    createAdminSupabaseClient: vi.fn(),
    sweepClientStorage: vi.fn(),
    revalidateTag: vi.fn(),
    revalidatePath: vi.fn(),
    provisionClient: vi.fn(),
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
vi.mock('@/lib/clients/sweep-client-storage', () => ({
  sweepClientStorage: mocks.sweepClientStorage,
}))
vi.mock('@/features/clients/lib/provision-client', () => ({
  provisionClient: mocks.provisionClient,
}))
const requireEntitledAction = vi.fn(async () => null as { ok: false; error: string } | null)
const getCachedEntitlement = vi.fn()
const getCachedAgency = vi.fn(async () => ({ stripe_subscription_id: null as string | null }))
const countClientsByAgency = vi.fn(async () => 0)
const syncSubscriptionQuantity = vi.fn(async () => undefined)
vi.mock('@/lib/billing/require-entitled', () => ({
  requireEntitledAction: (...args: unknown[]) => requireEntitledAction(...(args as [])),
}))
const revalidateClientData = vi.fn()
vi.mock('@/lib/queries/cache', () => ({
  getCachedEntitlement: (...args: unknown[]) => getCachedEntitlement(...(args as [])),
  getCachedAgency: (...args: unknown[]) => getCachedAgency(...(args as [])),
  revalidateClientData: () => revalidateClientData(),
}))
vi.mock('@/lib/billing/quantity-sync', () => ({
  // The real rule, so the tests exercise "paid and live" rather than a stub of it.
  billedSubscriptionId: (
    entitlement: { plan: string; state: string },
    agency: { stripe_subscription_id: string | null } | null
  ) =>
    entitlement.plan === 'pro' &&
    (entitlement.state === 'active' || entitlement.state === 'past_due')
      ? (agency?.stripe_subscription_id ?? null)
      : null,
  syncSubscriptionQuantity: (...args: unknown[]) => syncSubscriptionQuantity(...(args as [])),
}))
vi.mock('@/lib/queries/db', () => ({
  countClientsByAgency: (...args: unknown[]) => countClientsByAgency(...(args as [])),
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
    mocks.sweepClientStorage.mockResolvedValue({ images: 0, files: 0 })
    // A trial workspace: the delete tells Stripe nothing.
    getCachedEntitlement.mockResolvedValue({ plan: 'trial', state: 'trial' })
    getCachedAgency.mockResolvedValue({ stripe_subscription_id: null })
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
    expect(mocks.sweepClientStorage).not.toHaveBeenCalled()
  })

  it('sweeps the storage and busts every client-fed cache after the rows are gone', async () => {
    mocks.createAdminSupabaseClient.mockReturnValue(recordingAdmin().client)

    const { deleteClient } = await import('../client-actions')
    await deleteClient(CLIENT_ID)

    expect(mocks.sweepClientStorage).toHaveBeenCalledWith(CLIENT_ID)
    // Which tags that is — the roster, the post stats, the ideas badge, the analytics report —
    // is pinned once, on the helper (src/lib/queries/__tests__/revalidate-client-data.test.ts).
    expect(revalidateClientData).toHaveBeenCalledTimes(1)
  })
})

describe('createClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveActionAuth.mockResolvedValue({
      ok: true,
      supabase: {} as never,
      agencyId: AGENCY_ID,
      userId: 'user-1',
    })
    mocks.provisionClient.mockResolvedValue({ ok: true, clientId: CLIENT_ID })
    requireEntitledAction.mockResolvedValue(null)
    getCachedEntitlement.mockResolvedValue({
      plan: 'trial',
      mode: 'agency',
      canCreate: true,
      brands: 3,
      brandsUnlimited: false,
    })
    countClientsByAgency.mockResolvedValue(0)
  })

  it('refuses the brand past the plan cap without provisioning', async () => {
    countClientsByAgency.mockResolvedValue(3)
    const { createClient } = await import('../client-actions')
    const result = await createClient({ name: 'Acme', niche: 'Branding' })

    expect(result.ok).toBe(false)
    expect(mocks.provisionClient).not.toHaveBeenCalled()
  })

  it('refuses a paused workspace before reading anything', async () => {
    requireEntitledAction.mockResolvedValue({ ok: false, error: 'paused' })
    const { createClient } = await import('../client-actions')
    const result = await createClient({ name: 'Acme', niche: 'Branding' })

    expect(result).toEqual({ ok: false, error: 'paused' })
    expect(countClientsByAgency).not.toHaveBeenCalled()
    expect(mocks.provisionClient).not.toHaveBeenCalled()
  })

  it('provisions through the one client writer and busts the roster immediately', async () => {
    const { createClient } = await import('../client-actions')
    const result = await createClient({ name: 'Acme', niche: 'Branding' })

    expect(result).toEqual({ ok: true, data: CLIENT_ID })
    expect(mocks.provisionClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ agencyId: AGENCY_ID, name: 'Acme', niche: 'Branding' })
    )
    // { expire: 0 }, not 'max': the caller navigates straight to a page whose first-run gate
    // reads the roster, and 'max' would serve the cached empty list once more.
    expect(mocks.revalidateTag).toHaveBeenCalledWith('agency-clients', { expire: 0 })
  })

  it('rejects an unauthenticated caller before touching the input', async () => {
    mocks.resolveActionAuth.mockResolvedValue({ ok: false, error: 'Unauthorized' })

    const { createClient } = await import('../client-actions')
    const result = await createClient({ name: 'Acme' })

    expect(result).toEqual({ ok: false, error: 'Unauthorized' })
    expect(mocks.provisionClient).not.toHaveBeenCalled()
  })

  describe('on a paid workspace', () => {
    beforeEach(() => {
      getCachedEntitlement.mockResolvedValue({
        plan: 'pro',
        state: 'active',
        mode: 'agency',
        canCreate: true,
        brands: 3,
        brandsUnlimited: true,
      })
      getCachedAgency.mockResolvedValue({ stripe_subscription_id: 'sub_1' })
      countClientsByAgency.mockResolvedValue(3)
      syncSubscriptionQuantity.mockReset().mockResolvedValue(undefined)
    })

    it('charges Stripe for the new count before the row exists', async () => {
      const order: string[] = []
      syncSubscriptionQuantity.mockImplementation(async () => {
        order.push('stripe')
      })
      mocks.provisionClient.mockImplementation(async () => {
        order.push('provision')
        return { ok: true, clientId: CLIENT_ID }
      })

      const { createClient } = await import('../client-actions')
      const result = await createClient({ name: 'Acme', niche: 'Branding' })

      expect(result).toEqual({ ok: true, data: CLIENT_ID })
      expect(syncSubscriptionQuantity).toHaveBeenCalledWith('sub_1', 4, 'charge')
      expect(order).toEqual(['stripe', 'provision'])
    })

    it('adds no client when the card is declined, and says why', async () => {
      syncSubscriptionQuantity.mockRejectedValue(new Error('The card on file was declined: …'))
      const { createClient } = await import('../client-actions')
      const result = await createClient({ name: 'Acme', niche: 'Branding' })

      expect(result).toEqual({ ok: false, error: 'The card on file was declined: …' })
      expect(mocks.provisionClient).not.toHaveBeenCalled()
    })

    it('credits the charge back when the row cannot be made', async () => {
      mocks.provisionClient.mockResolvedValue({ ok: false, error: 'insert failed' })
      const { createClient } = await import('../client-actions')
      const result = await createClient({ name: 'Acme', niche: 'Branding' })

      expect(result).toEqual({ ok: false, error: 'insert failed' })
      expect(syncSubscriptionQuantity).toHaveBeenLastCalledWith('sub_1', 3, 'credit')
    })

    it('never asks Stripe for anything on a trial', async () => {
      getCachedEntitlement.mockResolvedValue({
        plan: 'trial',
        state: 'trial',
        mode: 'agency',
        canCreate: true,
        brands: 3,
        brandsUnlimited: false,
      })
      const { createClient } = await import('../client-actions')
      await createClient({ name: 'Acme', niche: 'Branding' })
      expect(syncSubscriptionQuantity).not.toHaveBeenCalled()
    })
  })
})

describe('deleteClient on a paid workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveActionAuth.mockResolvedValue({
      ok: true,
      supabase: {} as never,
      agencyId: AGENCY_ID,
      userId: 'user-1',
    })
    mocks.fetchClientWithOwnership.mockResolvedValue({ id: CLIENT_ID, name: 'Dr Kamberova' })
    mocks.sweepClientStorage.mockResolvedValue({ images: 0, files: 0 })
    mocks.createAdminSupabaseClient.mockReturnValue(recordingAdmin().client)
    getCachedEntitlement.mockResolvedValue({ plan: 'pro', state: 'active' })
    getCachedAgency.mockResolvedValue({ stripe_subscription_id: 'sub_1' })
    countClientsByAgency.mockResolvedValue(2)
    syncSubscriptionQuantity.mockReset().mockResolvedValue(undefined)
  })

  it('tells Stripe the remaining count, uncharged, after the row is gone', async () => {
    const { deleteClient } = await import('../client-actions')
    expect(await deleteClient(CLIENT_ID)).toEqual({ ok: true, data: undefined })
    expect(syncSubscriptionQuantity).toHaveBeenCalledWith('sub_1', 2, 'none')
  })

  it('logs a Stripe failure there rather than failing a delete that already happened', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    syncSubscriptionQuantity.mockRejectedValue(new Error('rate limited'))
    const { deleteClient } = await import('../client-actions')
    expect(await deleteClient(CLIENT_ID)).toEqual({ ok: true, data: undefined })
    expect(console.error).toHaveBeenCalled()
  })
})

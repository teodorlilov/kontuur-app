import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * `deleteClient` and `createClient`, executed. The delete runs on the admin client, which bypasses
 * RLS, so the caller's agency handed to `unprovisionClient` (whose predicates its own test pins) is
 * all that keeps it off another agency's client. The 23503 branch exists because a database
 * missing migration 20260820 looks like a transient fault without it; the storage sweep runs only
 * after the rows are gone; the cache busts go through `revalidateClientData`, whose tag list is
 * pinned in src/lib/queries/__tests__/revalidate-client-data.test.ts.
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
    unprovisionClient: vi.fn(),
    takeBackClient: vi.fn(),
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
  unprovisionClient: mocks.unprovisionClient,
  takeBackClient: mocks.takeBackClient,
}))
const requireEntitledAction = vi.fn(async () => null as { ok: false; error: string } | null)
const getCachedEntitlement = vi.fn()
const getCachedAgency = vi.fn(
  async (): Promise<{
    stripe_subscription_id: string | null
    current_period_start?: string | null
  }> => ({ stripe_subscription_id: null })
)
const countClientsByAgency = vi.fn(async () => 0)
const syncSubscriptionQuantity = vi.fn(async (..._args: unknown[]) => undefined)
/** The sync's refusal class, so the action's `instanceof` sees the same one the tests throw. */
class QuantityChargeError extends Error {}
vi.mock('@/lib/billing/require-entitled', () => ({
  requireEntitledAction: (...args: unknown[]) => requireEntitledAction(...(args as [])),
}))
const revalidateClientData = vi.fn()
vi.mock('@/lib/queries/cache', () => ({
  getCachedEntitlement: (...args: unknown[]) => getCachedEntitlement(...(args as [])),
  getCachedAgency: (...args: unknown[]) => getCachedAgency(...(args as [])),
  revalidateClientData: () => revalidateClientData(),
}))
/**
 * The sync is a stand-in; the two subscription rules are the real ones, so the tests exercise
 * "paid and live" (an increase) and "open" (a decrease) rather than stubs of them.
 */
vi.mock('@/lib/billing/quantity-sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/quantity-sync')>()
  return {
    billedSubscriptionId: actual.billedSubscriptionId,
    openSubscriptionId: actual.openSubscriptionId,
    syncSubscriptionQuantity: (...args: unknown[]) => syncSubscriptionQuantity(...args),
    QuantityChargeError,
  }
})
vi.mock('@/lib/queries/db', () => ({
  countClientsByAgency: (...args: unknown[]) => countClientsByAgency(...(args as [])),
}))
// unstable_cache is required, not incidental: the real quantity-sync (importOriginal above)
// imports src/lib/billing/stripe.ts, which calls unstable_cache at module scope — without it
// the file throws on import and every test here fails before it runs.
vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
  revalidatePath: mocks.revalidatePath,
  unstable_cache: (fn: unknown) => fn,
}))

/** The admin client the action hands to `unprovisionClient` and the sync; it is never read here. */
const ADMIN = { admin: true }

/** Each case starts on a trial workspace, where a delete tells Stripe nothing. */
describe('deleteClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveActionAuth.mockResolvedValue({
      ok: true,
      supabase: {} as never,
      agencyId: AGENCY_ID,
      userId: 'user-1',
      role: 'admin',
    })
    mocks.fetchClientWithOwnership.mockResolvedValue({ id: CLIENT_ID, name: 'Dr Kamberova' })
    mocks.sweepClientStorage.mockResolvedValue({ images: 0, files: 0 })
    mocks.createAdminSupabaseClient.mockReturnValue(ADMIN)
    mocks.unprovisionClient.mockResolvedValue(null)
    getCachedEntitlement.mockResolvedValue({
      plan: 'trial',
      state: 'trial',
      subscriptionOpen: false,
    })
    getCachedAgency.mockResolvedValue({ stripe_subscription_id: null })
  })

  it('removes the row through the one client delete, scoped to the caller’s agency', async () => {
    const { deleteClient } = await import('../client-actions')
    const result = await deleteClient(CLIENT_ID)

    expect(result).toEqual({ ok: true, data: undefined })
    expect(mocks.unprovisionClient).toHaveBeenCalledWith(ADMIN, CLIENT_ID, AGENCY_ID)
  })

  it('rejects a non-uuid before touching the database', async () => {
    const { deleteClient } = await import('../client-actions')
    const result = await deleteClient('client-1')

    expect(result.ok).toBe(false)
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled()
  })

  it('names the missing migration when a foreign key still blocks the delete', async () => {
    mocks.unprovisionClient.mockResolvedValue({
      code: '23503',
      message: 'violates foreign key constraint',
    })
    const { deleteClient } = await import('../client-actions')
    const result = await deleteClient(CLIENT_ID)

    expect(result).toEqual({
      ok: false,
      error: 'Cannot delete: the database is missing migration 20260820.',
    })
  })

  it('leaves stored files alone when the row delete fails, so a live client keeps its images', async () => {
    mocks.unprovisionClient.mockResolvedValue({ message: 'connection reset' })
    const { deleteClient } = await import('../client-actions')
    const result = await deleteClient(CLIENT_ID)

    expect(result.ok).toBe(false)
    expect(mocks.sweepClientStorage).not.toHaveBeenCalled()
  })

  it('sweeps the storage and busts every client-fed cache through revalidateClientData after the rows are gone', async () => {
    const { deleteClient } = await import('../client-actions')
    await deleteClient(CLIENT_ID)

    expect(mocks.sweepClientStorage).toHaveBeenCalledWith(CLIENT_ID)
    expect(revalidateClientData).toHaveBeenCalledTimes(1)
  })

  it('tells Stripe nothing on a trial', async () => {
    const { deleteClient } = await import('../client-actions')
    await deleteClient(CLIENT_ID)
    expect(syncSubscriptionQuantity).not.toHaveBeenCalled()
  })

  it('refuses a member before the client is read or anything is deleted, since a delete cannot be undone', async () => {
    mocks.resolveActionAuth.mockResolvedValue({
      ok: true,
      supabase: {} as never,
      agencyId: AGENCY_ID,
      userId: 'user-2',
      role: 'member',
    })
    const { deleteClient } = await import('../client-actions')
    const result = await deleteClient(CLIENT_ID)

    expect(result).toEqual({ ok: false, error: 'Only admins can add or delete clients.' })
    expect(mocks.fetchClientWithOwnership).not.toHaveBeenCalled()
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled()
    expect(mocks.unprovisionClient).not.toHaveBeenCalled()
    expect(mocks.sweepClientStorage).not.toHaveBeenCalled()
    expect(syncSubscriptionQuantity).not.toHaveBeenCalled()
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
      role: 'admin',
    })
    mocks.provisionClient.mockResolvedValue({ ok: true, clientId: CLIENT_ID })
    mocks.createAdminSupabaseClient.mockReturnValue(ADMIN)
    mocks.unprovisionClient.mockResolvedValue(null)
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

  it('provisions through the one client writer and busts the roster immediately, since the next page’s first-run gate reads it', async () => {
    const { createClient } = await import('../client-actions')
    const result = await createClient({ name: 'Acme', niche: 'Branding' })

    expect(result).toEqual({ ok: true, data: CLIENT_ID })
    expect(mocks.provisionClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ agencyId: AGENCY_ID, name: 'Acme', niche: 'Branding' })
    )
    expect(mocks.revalidateTag).toHaveBeenCalledWith('agency-clients', { expire: 0 })
  })

  it('rejects an unauthenticated caller before touching the input', async () => {
    mocks.resolveActionAuth.mockResolvedValue({ ok: false, error: 'Unauthorized' })

    const { createClient } = await import('../client-actions')
    const result = await createClient({ name: 'Acme' })

    expect(result).toEqual({ ok: false, error: 'Unauthorized' })
    expect(mocks.provisionClient).not.toHaveBeenCalled()
  })

  it.each([
    ['a trial below its cap', { plan: 'trial', state: 'trial', brandsUnlimited: false }],
    ['a paid plan, which counts no cap', { plan: 'pro', state: 'active', brandsUnlimited: true }],
  ])('refuses a member on %s before anything is provisioned', async (_label, plan) => {
    mocks.resolveActionAuth.mockResolvedValue({
      ok: true,
      supabase: {} as never,
      agencyId: AGENCY_ID,
      userId: 'user-2',
      role: 'member',
    })
    getCachedEntitlement.mockResolvedValue({ ...plan, mode: 'agency', canCreate: true, brands: 3 })
    getCachedAgency.mockResolvedValue({ stripe_subscription_id: 'sub_1' })
    const { createClient } = await import('../client-actions')
    const result = await createClient({ name: 'Acme', niche: 'Branding' })

    expect(result).toEqual({ ok: false, error: 'Only admins can add or delete clients.' })
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled()
    expect(mocks.provisionClient).not.toHaveBeenCalled()
    expect(syncSubscriptionQuantity).not.toHaveBeenCalled()
  })

  it('re-counts after the insert and gives back a client two racing creates took past the cap', async () => {
    countClientsByAgency.mockResolvedValueOnce(2).mockResolvedValueOnce(4)
    const { createClient } = await import('../client-actions')
    const result = await createClient({ name: 'Acme', niche: 'Branding' })

    expect(result).toEqual({
      ok: false,
      error: 'Trial includes 3 clients. Choose a plan to add more.',
    })
    expect(mocks.takeBackClient).toHaveBeenCalledWith(expect.anything(), CLIENT_ID, AGENCY_ID)
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it('keeps a client that brings the workspace exactly to its cap', async () => {
    countClientsByAgency.mockResolvedValueOnce(2).mockResolvedValueOnce(3)
    const { createClient } = await import('../client-actions')
    expect(await createClient({ name: 'Acme', niche: 'Branding' })).toEqual({
      ok: true,
      data: CLIENT_ID,
    })
    expect(mocks.takeBackClient).not.toHaveBeenCalled()
  })

  it('keeps the client, logged, when the re-count after the insert fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    countClientsByAgency
      .mockResolvedValueOnce(2)
      .mockRejectedValueOnce(new Error('countClientsByAgency failed'))
    const { createClient } = await import('../client-actions')
    expect(await createClient({ name: 'Acme', niche: 'Branding' })).toEqual({
      ok: true,
      data: CLIENT_ID,
    })
    expect(mocks.takeBackClient).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(
      `[clients:create] cap re-count failed for ${AGENCY_ID}; client kept:`,
      expect.any(Error)
    )
  })

  describe('on a paid workspace', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      getCachedEntitlement.mockResolvedValue({
        plan: 'pro',
        state: 'active',
        mode: 'agency',
        canCreate: true,
        brands: 3,
        brandsUnlimited: true,
      })
      getCachedAgency.mockResolvedValue({
        stripe_subscription_id: 'sub_1',
        current_period_start: '2026-09-01T00:00:00+00:00',
      })
      syncSubscriptionQuantity.mockReset().mockResolvedValue(undefined)
      mocks.unprovisionClient.mockResolvedValue(null)
    })

    it('makes the client, then charges only above the clients already paid for', async () => {
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
      expect(syncSubscriptionQuantity).toHaveBeenCalledWith(expect.anything(), AGENCY_ID, 'sub_1', {
        direction: 'increase',
        paid: 3,
        paidFor: '2026-09-01T00:00:00+00:00',
      })
      expect(order).toEqual(['provision', 'stripe'])
    })

    it.each([
      [
        'a declined card',
        'The card on file was declined: … Update it in Plan & billing and try again.',
      ],
      ['a claim still busy', 'Another change to your plan is in progress. Try again in a moment.'],
    ])('undoes the client on %s, lowers Stripe back, and says why', async (_label, sentence) => {
      syncSubscriptionQuantity.mockRejectedValueOnce(new QuantityChargeError(sentence))
      const { createClient } = await import('../client-actions')
      const result = await createClient({ name: 'Acme', niche: 'Branding' })

      expect(result).toEqual({ ok: false, error: sentence })
      expect(mocks.takeBackClient).toHaveBeenCalledWith(expect.anything(), CLIENT_ID, AGENCY_ID)
      expect(syncSubscriptionQuantity).toHaveBeenLastCalledWith(
        expect.anything(),
        AGENCY_ID,
        'sub_1',
        { direction: 'decrease' }
      )
    })

    it('keeps the client, with no SDK text, when the sync fails any other way', async () => {
      syncSubscriptionQuantity.mockRejectedValueOnce(new Error('quantity claim failed: timeout'))
      const { createClient } = await import('../client-actions')
      expect(await createClient({ name: 'Acme', niche: 'Branding' })).toEqual({
        ok: true,
        data: CLIENT_ID,
      })
      expect(mocks.takeBackClient).not.toHaveBeenCalled()
      expect(console.error).toHaveBeenCalled()
    })

    it('asks Stripe for nothing when the client cannot be made', async () => {
      mocks.provisionClient.mockResolvedValue({ ok: false, error: 'insert failed' })
      const { createClient } = await import('../client-actions')
      const result = await createClient({ name: 'Acme', niche: 'Branding' })

      expect(result).toEqual({ ok: false, error: 'insert failed' })
      expect(syncSubscriptionQuantity).not.toHaveBeenCalled()
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
      role: 'admin',
    })
    mocks.fetchClientWithOwnership.mockResolvedValue({ id: CLIENT_ID, name: 'Dr Kamberova' })
    mocks.sweepClientStorage.mockResolvedValue({ images: 0, files: 0 })
    mocks.createAdminSupabaseClient.mockReturnValue(ADMIN)
    mocks.unprovisionClient.mockResolvedValue(null)
    getCachedEntitlement.mockResolvedValue({
      plan: 'pro',
      state: 'active',
      brands: 3,
      subscriptionOpen: true,
    })
    getCachedAgency.mockResolvedValue({ stripe_subscription_id: 'sub_1' })
    syncSubscriptionQuantity.mockReset().mockResolvedValue(undefined)
  })

  it('lowers Stripe’s count, uncharged, after the row is gone', async () => {
    const { deleteClient } = await import('../client-actions')
    expect(await deleteClient(CLIENT_ID)).toEqual({ ok: true, data: undefined })
    expect(syncSubscriptionQuantity).toHaveBeenCalledWith(ADMIN, AGENCY_ID, 'sub_1', {
      direction: 'decrease',
    })
  })

  it('lowers the count of a locked workspace whose subscription is still open, since a decrease never charges', async () => {
    getCachedEntitlement.mockResolvedValue({
      plan: 'pro',
      state: 'locked',
      brands: 0,
      subscriptionOpen: true,
    })
    const { deleteClient } = await import('../client-actions')
    expect(await deleteClient(CLIENT_ID)).toEqual({ ok: true, data: undefined })
    expect(syncSubscriptionQuantity).toHaveBeenCalledWith(ADMIN, AGENCY_ID, 'sub_1', {
      direction: 'decrease',
    })
  })

  it('leaves an ended subscription alone', async () => {
    getCachedEntitlement.mockResolvedValue({
      plan: 'pro',
      state: 'locked',
      brands: 0,
      subscriptionOpen: false,
    })
    const { deleteClient } = await import('../client-actions')
    expect(await deleteClient(CLIENT_ID)).toEqual({ ok: true, data: undefined })
    expect(syncSubscriptionQuantity).not.toHaveBeenCalled()
  })

  it('logs a Stripe failure there rather than failing a delete that already happened', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    syncSubscriptionQuantity.mockRejectedValue(new Error('rate limited'))
    const { deleteClient } = await import('../client-actions')
    expect(await deleteClient(CLIENT_ID)).toEqual({ ok: true, data: undefined })
    expect(console.error).toHaveBeenCalled()
  })
})

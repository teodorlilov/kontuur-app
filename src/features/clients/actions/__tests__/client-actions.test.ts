import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * `deleteClient` and `createClient`, executed. The delete runs on the admin client, which bypasses
 * RLS, so the caller's agency handed to `unprovisionClient` (whose predicates its own test pins) is
 * all that keeps it off another agency's client. The storage sweep runs only after the rows are
 * gone; the cache busts go through `revalidateClientData`, whose tag list is
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
const countClientsByAgency = vi.fn(async () => 0)
vi.mock('@/lib/billing/require-entitled', () => ({
  requireEntitledAction: (...args: unknown[]) => requireEntitledAction(...(args as [])),
}))
const revalidateClientData = vi.fn()
vi.mock('@/lib/queries/cache', () => ({
  getCachedEntitlement: (...args: unknown[]) => getCachedEntitlement(...(args as [])),
  revalidateClientData: () => revalidateClientData(),
}))
vi.mock('@/lib/queries/db', () => ({
  countClientsByAgency: (...args: unknown[]) => countClientsByAgency(...(args as [])),
}))
vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
  revalidatePath: mocks.revalidatePath,
}))

/** The admin client the action hands to `unprovisionClient` and the cap re-count; never read here. */
const ADMIN = { admin: true }

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

  it('reads no plan, since a deleted client frees a slot and changes no bill', async () => {
    const { deleteClient } = await import('../client-actions')
    expect(await deleteClient(CLIENT_ID)).toEqual({ ok: true, data: undefined })
    expect(getCachedEntitlement).not.toHaveBeenCalled()
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
    requireEntitledAction.mockResolvedValue(null)
    getCachedEntitlement.mockResolvedValue({
      canSpend: true,
      plan: 'trial',
      mode: 'agency',
      brands: 3,
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
    ['a trial below its cap', { plan: 'trial', state: 'trial' }],
    ['a paid plan below its slots', { plan: 'pro', state: 'active' }],
  ])('refuses a member on %s before anything is provisioned', async (_label, plan) => {
    mocks.resolveActionAuth.mockResolvedValue({
      ok: true,
      supabase: {} as never,
      agencyId: AGENCY_ID,
      userId: 'user-2',
      role: 'member',
    })
    getCachedEntitlement.mockResolvedValue({ ...plan, canSpend: true, mode: 'agency', brands: 3 })
    const { createClient } = await import('../client-actions')
    const result = await createClient({ name: 'Acme', niche: 'Branding' })

    expect(result).toEqual({ ok: false, error: 'Only admins can add or delete clients.' })
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled()
    expect(mocks.provisionClient).not.toHaveBeenCalled()
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
      getCachedEntitlement.mockResolvedValue({
        canSpend: true,
        plan: 'pro',
        state: 'active',
        mode: 'agency',
        brands: 3,
      })
    })

    it('refuses a client past its slots without provisioning, in the slots sentence', async () => {
      countClientsByAgency.mockResolvedValue(3)
      const { createClient } = await import('../client-actions')
      expect(await createClient({ name: 'Acme', niche: 'Branding' })).toEqual({
        ok: false,
        error: 'All 3 client slots are in use. Add a slot to add more.',
      })
      expect(mocks.provisionClient).not.toHaveBeenCalled()
    })

    it('makes a client within its slots', async () => {
      countClientsByAgency.mockResolvedValueOnce(2).mockResolvedValueOnce(3)
      const { createClient } = await import('../client-actions')
      expect(await createClient({ name: 'Acme', niche: 'Branding' })).toEqual({
        ok: true,
        data: CLIENT_ID,
      })
      expect(mocks.takeBackClient).not.toHaveBeenCalled()
    })

    it('gives back a client two racing creates took past the slots', async () => {
      countClientsByAgency.mockResolvedValueOnce(2).mockResolvedValueOnce(4)
      const { createClient } = await import('../client-actions')
      expect(await createClient({ name: 'Acme', niche: 'Branding' })).toEqual({
        ok: false,
        error: 'All 3 client slots are in use. Add a slot to add more.',
      })
      expect(mocks.takeBackClient).toHaveBeenCalledWith(expect.anything(), CLIENT_ID, AGENCY_ID)
    })
  })

  it('counts nothing on the Internal plan, which has no cap', async () => {
    getCachedEntitlement.mockResolvedValue({
      canSpend: true,
      plan: 'house',
      state: 'active',
      mode: 'agency',
      brands: Infinity,
    })
    const { createClient } = await import('../client-actions')
    expect(await createClient({ name: 'Acme', niche: 'Branding' })).toEqual({
      ok: true,
      data: CLIENT_ID,
    })
    expect(countClientsByAgency).not.toHaveBeenCalled()
  })
})

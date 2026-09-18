import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveActionAuth: vi.fn(),
  getCachedAgency: vi.fn(),
  getCachedEntitlement: vi.fn(),
  countClientsByAgency: vi.fn(),
  ensureStripeCustomer: vi.fn(),
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
}))
vi.mock('@/lib/auth/helpers', () => ({ resolveActionAuth: mocks.resolveActionAuth }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: () => ({}) }))
vi.mock('@/lib/queries/cache', () => ({
  getCachedAgency: mocks.getCachedAgency,
  getCachedEntitlement: mocks.getCachedEntitlement,
}))
vi.mock('@/lib/queries/db', () => ({ countClientsByAgency: mocks.countClientsByAgency }))
vi.mock('@/lib/billing/subscription-store', () => ({
  ensureStripeCustomer: mocks.ensureStripeCustomer,
}))
vi.mock('@/lib/billing/checkout', () => ({
  createCheckoutSession: mocks.createCheckoutSession,
  createPortalSession: mocks.createPortalSession,
}))

import { openBillingPortal, startCheckout } from '../billing-actions'

const AGENCY = { id: 'a1', name: 'Acme', stripe_customer_id: null, stripe_subscription_id: null }

describe('the billing actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.resolveActionAuth.mockResolvedValue({
      ok: true,
      supabase: {},
      agencyId: 'a1',
      userId: 'u1',
      role: 'admin',
    })
    mocks.getCachedAgency.mockResolvedValue(AGENCY)
    mocks.getCachedEntitlement.mockResolvedValue({ plan: 'trial', state: 'trial', mode: 'agency' })
    mocks.countClientsByAgency.mockResolvedValue(3)
    mocks.ensureStripeCustomer.mockResolvedValue('cus_1')
    mocks.createCheckoutSession.mockResolvedValue('https://checkout.stripe.com/c/1')
    mocks.createPortalSession.mockResolvedValue('https://billing.stripe.com/p/1')
  })

  it('refuses a member with one sentence and asks Stripe nothing', async () => {
    mocks.resolveActionAuth.mockResolvedValue({
      ok: true,
      supabase: {},
      agencyId: 'a1',
      userId: 'u1',
      role: 'member',
    })
    expect(await startCheckout()).toEqual({ ok: false, error: 'Only admins can manage the plan.' })
    expect(await openBillingPortal()).toEqual({
      ok: false,
      error: 'Only admins can manage the plan.',
    })
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled()
  })

  it('sends an admin to Checkout with the client count as the quantity, never below one', async () => {
    expect(await startCheckout()).toEqual({
      ok: true,
      data: { url: 'https://checkout.stripe.com/c/1' },
    })
    expect(mocks.ensureStripeCustomer).toHaveBeenCalledWith({}, AGENCY)
    expect(mocks.createCheckoutSession).toHaveBeenCalledWith({
      customerId: 'cus_1',
      agencyId: 'a1',
      quantity: 3,
    })

    mocks.countClientsByAgency.mockResolvedValue(0)
    await startCheckout()
    expect(mocks.createCheckoutSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ quantity: 1 })
    )
  })

  it.each([
    ['an active plan', { plan: 'pro', state: 'active' }],
    ['a failed renewal', { plan: 'pro', state: 'past_due' }],
    ['a house workspace', { plan: 'house', state: 'active' }],
  ])('refuses a second Checkout for %s — the portal is the way', async (_label, entitlement) => {
    mocks.getCachedEntitlement.mockResolvedValue(entitlement)
    const result = await startCheckout()
    expect(result).toEqual({
      ok: false,
      error: 'This workspace already has a plan. Manage it in Plan & billing.',
    })
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled()
  })

  it('keeps Stripe’s words in the log and gives the person one sentence', async () => {
    mocks.createCheckoutSession.mockRejectedValue(new Error('No such price: price_x'))
    const result = await startCheckout()
    expect(result).toEqual({
      ok: false,
      error: 'Could not open Stripe just now. Please try again in a moment.',
    })
    expect(console.error).toHaveBeenCalled()
  })

  it('opens the portal only for a workspace that has a billing account', async () => {
    expect(await openBillingPortal()).toEqual({
      ok: false,
      error: 'There is no billing account yet — choose a plan first.',
    })
    mocks.getCachedAgency.mockResolvedValue({ ...AGENCY, stripe_customer_id: 'cus_1' })
    expect(await openBillingPortal()).toEqual({
      ok: true,
      data: { url: 'https://billing.stripe.com/p/1' },
    })
    expect(mocks.createPortalSession).toHaveBeenCalledWith('cus_1')
  })
})

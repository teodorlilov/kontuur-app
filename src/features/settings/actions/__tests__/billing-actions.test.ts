import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveActionAuth: vi.fn(),
  getCachedAgency: vi.fn(),
  getCachedEntitlement: vi.fn(),
  countClientsByAgency: vi.fn(),
  fetchAgencyById: vi.fn(),
  ensureStripeCustomer: vi.fn(),
  setPlanEnding: vi.fn(),
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
}))
vi.mock('@/lib/auth/helpers', () => ({ resolveActionAuth: mocks.resolveActionAuth }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: () => ({}) }))
vi.mock('@/lib/queries/cache', () => ({
  getCachedAgency: mocks.getCachedAgency,
  getCachedEntitlement: mocks.getCachedEntitlement,
}))
vi.mock('@/lib/queries/db', () => ({
  countClientsByAgency: mocks.countClientsByAgency,
  fetchAgencyById: mocks.fetchAgencyById,
}))
vi.mock('@/lib/billing/subscription-store', () => ({
  ensureStripeCustomer: mocks.ensureStripeCustomer,
  setPlanEnding: mocks.setPlanEnding,
}))
vi.mock('@/lib/billing/checkout', () => ({
  createCheckoutSession: mocks.createCheckoutSession,
  createPortalSession: mocks.createPortalSession,
}))

import type { AgencyBillingColumns } from '@/lib/queries/select-columns'
import { paidRow as billingPaidRow } from '@/lib/billing/__tests__/fixtures'
import { openBillingPortal, setPlanEndingAction, startCheckout } from '../billing-actions'

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
    mocks.getCachedEntitlement.mockResolvedValue({
      plan: 'trial',
      state: 'trial',
      mode: 'agency',
      subscriptionOpen: false,
    })
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
    ['an active plan', { plan: 'pro', state: 'active', subscriptionOpen: true }],
    ['a failed renewal in its grace', { plan: 'pro', state: 'past_due', subscriptionOpen: true }],
    ['a failed renewal past its grace', { plan: 'pro', state: 'locked', subscriptionOpen: true }],
    ['a house workspace', { plan: 'house', state: 'active', subscriptionOpen: false }],
  ])('refuses a second Checkout for %s — it would charge twice', async (_label, entitlement) => {
    mocks.getCachedEntitlement.mockResolvedValue(entitlement)
    const result = await startCheckout()
    expect(result).toEqual({
      ok: false,
      error: 'This workspace already has a plan. Manage it in Plan & billing.',
    })
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled()
  })

  it('offers Checkout again once a plan has ended', async () => {
    mocks.getCachedEntitlement.mockResolvedValue({
      plan: 'pro',
      state: 'locked',
      mode: 'agency',
      subscriptionOpen: false,
    })
    expect((await startCheckout()).ok).toBe(true)
  })

  it('says the plan is on its way when Stripe already holds a subscription the row does not show', async () => {
    mocks.createCheckoutSession.mockResolvedValue(null)
    expect(await startCheckout()).toEqual({
      ok: false,
      error: 'Your plan is being activated — it appears here in a few seconds.',
    })
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

/** A paid row as the uncached settings read returns it: identity plus the billing columns. */
const paidRow = (overrides: Partial<AgencyBillingColumns> = {}) => ({
  id: 'a1',
  name: 'Acme',
  ...billingPaidRow(new Date(), { subscription_quantity: 2, ...overrides }),
})

describe('setPlanEndingAction', () => {
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
    mocks.fetchAgencyById.mockResolvedValue(paidRow())
    mocks.setPlanEnding.mockResolvedValue({ endedNow: false })
  })

  it('ends a running plan through the store, on the admin client, and says how it ended', async () => {
    expect(await setPlanEndingAction(true)).toEqual({ ok: true, data: { endedNow: false } })
    expect(mocks.setPlanEnding).toHaveBeenCalledWith({}, 'sub_1', true)
    mocks.setPlanEnding.mockResolvedValue({ endedNow: true })
    expect(await setPlanEndingAction(true)).toEqual({ ok: true, data: { endedNow: true } })
  })

  it('keeps a plan that is set to end', async () => {
    mocks.fetchAgencyById.mockResolvedValue(paidRow({ cancel_at_period_end: true }))
    expect(await setPlanEndingAction(false)).toEqual({ ok: true, data: { endedNow: false } })
    expect(mocks.setPlanEnding).toHaveBeenCalledWith({}, 'sub_1', false)
  })

  it('lets a plan whose renewal failed be cancelled even when set to end — that renewal is still collected, so the store ends it at once', async () => {
    const failed = new Date(Date.now() - 9 * 86_400_000).toISOString()
    mocks.fetchAgencyById.mockResolvedValue(
      paidRow({
        subscription_status: 'past_due',
        past_due_since: failed,
        cancel_at_period_end: true,
      })
    )
    mocks.setPlanEnding.mockResolvedValue({ endedNow: true })
    expect(await setPlanEndingAction(true)).toEqual({ ok: true, data: { endedNow: true } })
    expect(mocks.setPlanEnding).toHaveBeenCalledWith({}, 'sub_1', true)
  })

  it('refuses to cancel what is not running, and to keep what is not ending', async () => {
    mocks.fetchAgencyById.mockResolvedValue(paidRow({ cancel_at_period_end: true }))
    expect(await setPlanEndingAction(true)).toEqual({
      ok: false,
      error: 'There is no running plan to cancel.',
    })
    mocks.fetchAgencyById.mockResolvedValue(paidRow())
    expect(await setPlanEndingAction(false)).toEqual({
      ok: false,
      error: 'Your plan is not set to end.',
    })
    mocks.fetchAgencyById.mockResolvedValue(
      paidRow({ stripe_subscription_id: null, plan: 'trial' })
    )
    expect(await setPlanEndingAction(true)).toEqual({
      ok: false,
      error: 'There is no running plan to cancel.',
    })
    expect(mocks.setPlanEnding).not.toHaveBeenCalled()
  })

  it('refuses a member, and says one sentence when Stripe fails', async () => {
    mocks.resolveActionAuth.mockResolvedValueOnce({
      ok: true,
      supabase: {},
      agencyId: 'a1',
      userId: 'u1',
      role: 'member',
    })
    expect(await setPlanEndingAction(true)).toEqual({
      ok: false,
      error: 'Only admins can manage the plan.',
    })
    mocks.setPlanEnding.mockRejectedValue(new Error('stripe down'))
    expect(await setPlanEndingAction(true)).toEqual({
      ok: false,
      error: 'Could not open Stripe just now. Please try again in a moment.',
    })
  })
})

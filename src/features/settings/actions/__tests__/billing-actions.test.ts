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
  setClientSlots: vi.fn(),
  SlotChangeError: class SlotChangeError extends Error {},
  SlotSnapshotError: class SlotSnapshotError extends Error {
    constructor(
      readonly outcome: string,
      options: ErrorOptions
    ) {
      super('slot change made, row not written', options)
    }
  },
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
vi.mock('@/lib/billing/client-slots', () => ({
  setClientSlots: mocks.setClientSlots,
  SlotChangeError: mocks.SlotChangeError,
  SlotSnapshotError: mocks.SlotSnapshotError,
}))

import type { AgencyBillingColumns } from '@/lib/queries/select-columns'
import { paidRow as billingPaidRow } from '@/lib/billing/__tests__/fixtures'
import {
  openBillingPortal,
  setClientSlotsAction,
  setPlanEndingAction,
  startCheckout,
} from '../billing-actions'

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
    expect(await startCheckout(3)).toEqual({ ok: false, error: 'Only admins can manage the plan.' })
    expect(await openBillingPortal()).toEqual({
      ok: false,
      error: 'Only admins can manage the plan.',
    })
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled()
  })

  it('sends an admin to Checkout for the client slots they chose', async () => {
    expect(await startCheckout(4)).toEqual({
      ok: true,
      data: { url: 'https://checkout.stripe.com/c/1' },
    })
    expect(mocks.ensureStripeCustomer).toHaveBeenCalledWith({}, AGENCY)
    expect(mocks.createCheckoutSession).toHaveBeenCalledWith({
      customerId: 'cus_1',
      agencyId: 'a1',
      quantity: 4,
    })

    mocks.countClientsByAgency.mockResolvedValue(0)
    await startCheckout(1)
    expect(mocks.createCheckoutSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ quantity: 1 })
    )
  })

  it.each([
    ['fewer slots than clients', 2, 'You have 3 clients. Delete a client first to pay for fewer.'],
    ['more than fifty slots', 51, 'A workspace can pay for at most 50 client slots.'],
    ['a fraction of a slot', 1.5, 'Invalid number of client slots'],
  ])('refuses %s before Stripe is asked', async (_label, slots, error) => {
    expect(await startCheckout(slots)).toEqual({ ok: false, error })
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled()
  })

  it('sells a solo workspace its one business, and nothing else', async () => {
    mocks.getCachedEntitlement.mockResolvedValue({
      plan: 'trial',
      state: 'trial',
      mode: 'solo',
      subscriptionOpen: false,
    })
    mocks.countClientsByAgency.mockResolvedValue(1)
    expect(await startCheckout(2)).toEqual({
      ok: false,
      error: 'A solo workspace pays for its one business.',
    })
    expect((await startCheckout(1)).ok).toBe(true)
  })

  it.each([
    ['an active plan', { plan: 'pro', state: 'active', subscriptionOpen: true }],
    ['a failed renewal in its grace', { plan: 'pro', state: 'past_due', subscriptionOpen: true }],
    ['a failed renewal past its grace', { plan: 'pro', state: 'locked', subscriptionOpen: true }],
    ['a house workspace', { plan: 'house', state: 'active', subscriptionOpen: false }],
  ])('refuses a second Checkout for %s — it would charge twice', async (_label, entitlement) => {
    mocks.getCachedEntitlement.mockResolvedValue(entitlement)
    const result = await startCheckout(3)
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
    expect((await startCheckout(3)).ok).toBe(true)
  })

  it('says the plan is on its way when Stripe already holds a subscription the row does not show', async () => {
    mocks.createCheckoutSession.mockResolvedValue(null)
    expect(await startCheckout(3)).toEqual({
      ok: false,
      error: 'Your plan is being activated — it appears here in a few seconds.',
    })
  })

  it('keeps Stripe’s words in the log and gives the person one sentence', async () => {
    mocks.createCheckoutSession.mockRejectedValue(new Error('No such price: price_x'))
    const result = await startCheckout(3)
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

/** The paid period around the real clock, so a change is inside it rather than after its renewal. */
const PERIOD_START = new Date(Date.now() - 10 * 86_400_000).toISOString()
const PERIOD_END = new Date(Date.now() + 20 * 86_400_000).toISOString()

/** A paid row as the uncached settings read returns it: identity plus the billing columns. */
const paidRow = (overrides: Partial<AgencyBillingColumns> = {}) => ({
  id: 'a1',
  name: 'Acme',
  ...billingPaidRow(new Date(), {
    subscription_quantity: 2,
    current_period_start: PERIOD_START,
    current_period_end: PERIOD_END,
    ...overrides,
  }),
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

  it('answers a failed read of the row as Stripe being unavailable, logged once, never hanging', async () => {
    mocks.fetchAgencyById.mockRejectedValueOnce(new Error('connection reset'))
    expect(await setPlanEndingAction(true)).toEqual({
      ok: false,
      error: 'Could not open Stripe just now. Please try again in a moment.',
    })
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(mocks.setPlanEnding).not.toHaveBeenCalled()
  })
})

/** A change as the confirm sends it, priced on the row's period. */
const request = (from: number, to: number) => ({ from, to, periodStart: PERIOD_START })

describe('setClientSlotsAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.resolveActionAuth.mockResolvedValue({
      ok: true,
      supabase: {},
      agencyId: 'a1',
      userId: 'u1',
      role: 'admin',
    })
    mocks.fetchAgencyById.mockResolvedValue(paidRow({ subscription_quantity: 3, client_slots: 3 }))
    mocks.countClientsByAgency.mockResolvedValue(2)
    mocks.setClientSlots.mockResolvedValue('charged')
  })

  it("hands the change, the paid count and the period the confirm was priced on to Stripe's writer, and says what it did", async () => {
    expect(await setClientSlotsAction(request(3, 4))).toEqual({
      ok: true,
      data: { outcome: 'charged' },
    })
    expect(mocks.setClientSlots).toHaveBeenCalledWith({}, 'a1', 'sub_1', {
      from: 3,
      to: 4,
      paid: 3,
      periodStart: PERIOD_START,
    })
  })

  it('refuses a member before anything is read', async () => {
    mocks.resolveActionAuth.mockResolvedValueOnce({
      ok: true,
      supabase: {},
      agencyId: 'a1',
      userId: 'u1',
      role: 'member',
    })
    expect(await setClientSlotsAction(request(3, 4))).toEqual({
      ok: false,
      error: 'Only admins can manage the plan.',
    })
    expect(mocks.fetchAgencyById).not.toHaveBeenCalled()
  })

  it.each([
    [
      'below the clients',
      request(3, 1),
      'You have 2 clients. Delete a client first to pay for fewer.',
    ],
    ['a raise past fifty', request(3, 51), 'A workspace can pay for at most 50 client slots.'],
    ['a count that is not whole', request(3, 2.5), 'Invalid number of client slots'],
  ])('refuses %s and asks Stripe nothing', async (_label, input, error) => {
    expect(await setClientSlotsAction(input)).toEqual({ ok: false, error })
    expect(mocks.setClientSlots).not.toHaveBeenCalled()
  })

  it('lowers a count set higher than fifty by hand in Stripe', async () => {
    mocks.fetchAgencyById.mockResolvedValue(
      paidRow({ subscription_quantity: 60, client_slots: 60 })
    )
    mocks.setClientSlots.mockResolvedValue('lowered')
    expect(await setClientSlotsAction(request(60, 59))).toEqual({
      ok: true,
      data: { outcome: 'lowered' },
    })
  })

  it.each([
    ['a solo workspace', paidRow({ mode: 'solo' }), 'A solo workspace pays for its one business.'],
    [
      'a plan set to end',
      paidRow({ cancel_at_period_end: true }),
      /^Your plan ends on .+\. Keep your plan to change its client slots\.$/,
    ],
    [
      'a failed renewal',
      paidRow({ subscription_status: 'past_due', past_due_since: new Date().toISOString() }),
      'Your last payment failed. Update your card in Plan & billing to continue.',
    ],
    [
      'a workspace with no plan',
      paidRow({ stripe_subscription_id: null, plan: 'trial' }),
      'Choose a plan first.',
    ],
  ])('refuses a change on %s in the words the page shows', async (_label, row, error) => {
    mocks.fetchAgencyById.mockResolvedValue(row)
    const result = await setClientSlotsAction(request(3, 4))
    expect(result.ok).toBe(false)
    expect(result.ok ? null : result.error).toMatch(error)
    expect(mocks.setClientSlots).not.toHaveBeenCalled()
  })

  it('never goes below one slot, which no delete can reach', async () => {
    mocks.countClientsByAgency.mockResolvedValue(1)
    expect(await setClientSlotsAction(request(3, 0))).toEqual({
      ok: false,
      error: 'A plan pays for at least one client.',
    })
  })

  it('refuses a confirm priced on a period that has since renewed', async () => {
    const stale = { ...request(3, 4), periodStart: '2026-08-01T00:00:00Z' }
    expect(await setClientSlotsAction(stale)).toEqual({
      ok: false,
      error: 'Your plan has renewed since this page loaded. Reload the page to see its new period.',
    })
    expect(mocks.setClientSlots).not.toHaveBeenCalled()
  })

  it('reports a change Stripe made as made, even when its row could not be written', async () => {
    mocks.setClientSlots.mockRejectedValueOnce(
      new mocks.SlotSnapshotError('charged', { cause: new Error('row write failed') })
    )
    expect(await setClientSlotsAction(request(3, 4))).toEqual({
      ok: true,
      data: { outcome: 'charged' },
    })
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('answers a failed read as Stripe being unavailable, logged once', async () => {
    mocks.fetchAgencyById.mockRejectedValueOnce(new Error('connection reset'))
    expect(await setClientSlotsAction(request(3, 4))).toEqual({
      ok: false,
      error: 'Could not open Stripe just now. Please try again in a moment.',
    })
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it("passes on the writer's own sentence, and hides anything else behind one", async () => {
    mocks.setClientSlots.mockRejectedValueOnce(
      new mocks.SlotChangeError(
        'Another change to your plan is in progress. Try again in a moment.'
      )
    )
    expect(await setClientSlotsAction(request(3, 4))).toEqual({
      ok: false,
      error: 'Another change to your plan is in progress. Try again in a moment.',
    })
    expect(console.warn).toHaveBeenCalled()

    mocks.setClientSlots.mockRejectedValueOnce(new Error('socket hang up'))
    expect(await setClientSlotsAction(request(3, 4))).toEqual({
      ok: false,
      error: 'Could not open Stripe just now. Please try again in a moment.',
    })
    expect(console.error).toHaveBeenCalled()
  })
})

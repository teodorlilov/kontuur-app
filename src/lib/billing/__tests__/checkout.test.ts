import { beforeEach, describe, expect, it, vi } from 'vitest'

const stripe = vi.hoisted(() => ({
  subscriptionsList: vi.fn(),
  sessionsList: vi.fn(),
  sessionsExpire: vi.fn(),
  sessionsCreate: vi.fn(),
  pricesRetrieve: vi.fn(),
}))
vi.mock('next/cache', () => ({
  unstable_cache: <T>(work: T) => work,
}))
vi.mock('stripe', () => ({
  default: vi.fn(function FakeStripe() {
    return {
      subscriptions: { list: stripe.subscriptionsList },
      checkout: {
        sessions: {
          list: stripe.sessionsList,
          expire: stripe.sessionsExpire,
          create: stripe.sessionsCreate,
        },
      },
      prices: { retrieve: stripe.pricesRetrieve },
    }
  }),
}))

import { createCheckoutSession } from '../checkout'

const INPUT = { customerId: 'cus_1', agencyId: 'a1', quantity: 3 }
const PLAN_PRICE = {
  currency: 'eur',
  unit_amount: 2900,
  recurring: { interval: 'month', interval_count: 1 },
  tax_behavior: 'exclusive',
}

describe('createCheckoutSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_1')
    vi.stubEnv('STRIPE_PRICE_ID', 'price_1')
    stripe.subscriptionsList.mockResolvedValue({ data: [] })
    stripe.sessionsList.mockResolvedValue({ data: [] })
    stripe.sessionsExpire.mockResolvedValue({})
    stripe.sessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/1' })
    stripe.pricesRetrieve.mockResolvedValue(PLAN_PRICE)
  })

  it('opens a session for the plan’s price and the quantity asked for', async () => {
    expect(await createCheckoutSession(INPUT)).toBe('https://checkout.stripe.com/c/1')
    expect(stripe.subscriptionsList).toHaveBeenCalledWith({ customer: 'cus_1', limit: 100 })
    expect(stripe.sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_1',
        line_items: [{ price: 'price_1', quantity: 3 }],
        subscription_data: { metadata: { agency_id: 'a1' } },
      })
    )
  })

  it('opens nothing while Stripe holds an open subscription, even one the row does not show — a second session would charge twice', async () => {
    stripe.subscriptionsList.mockResolvedValue({ data: [{ id: 'sub_1', status: 'active' }] })
    expect(await createCheckoutSession(INPUT)).toBeNull()
    expect(stripe.sessionsExpire).not.toHaveBeenCalled()
    expect(stripe.sessionsCreate).not.toHaveBeenCalled()
  })

  it('does not count a subscription whose first payment never went through', async () => {
    stripe.subscriptionsList.mockResolvedValue({
      data: [{ id: 'sub_0', status: 'incomplete_expired' }],
    })
    expect(await createCheckoutSession(INPUT)).toBe('https://checkout.stripe.com/c/1')
  })

  it('expires the customer’s other open sessions before asking for subscriptions, so of two tabs only the newest can be paid', async () => {
    stripe.sessionsList.mockResolvedValue({ data: [{ id: 'cs_old' }, { id: 'cs_older' }] })
    await createCheckoutSession(INPUT)
    expect(stripe.sessionsList).toHaveBeenCalledWith({
      customer: 'cus_1',
      status: 'open',
      limit: 100,
    })
    expect(stripe.sessionsExpire).toHaveBeenCalledWith('cs_old')
    expect(stripe.sessionsExpire).toHaveBeenCalledWith('cs_older')
    const lastExpire = Math.max(...stripe.sessionsExpire.mock.invocationCallOrder)
    expect(lastExpire).toBeLessThan(stripe.subscriptionsList.mock.invocationCallOrder[0]!)
  })

  it('answers with the subscription of a session another tab paid before it could be expired', async () => {
    stripe.sessionsList.mockResolvedValue({ data: [{ id: 'cs_paid' }] })
    stripe.sessionsExpire.mockRejectedValue(
      new Error('Only Checkout Sessions with a status of open can be expired')
    )
    stripe.subscriptionsList.mockResolvedValue({ data: [{ id: 'sub_1', status: 'active' }] })
    expect(await createCheckoutSession(INPUT)).toBeNull()
    expect(stripe.sessionsCreate).not.toHaveBeenCalled()
  })

  it('opens no second payable session when an old one could not be expired', async () => {
    stripe.sessionsList.mockResolvedValue({ data: [{ id: 'cs_old' }] })
    stripe.sessionsExpire.mockRejectedValue(new Error('Stripe is unavailable'))
    stripe.subscriptionsList.mockResolvedValue({ data: [] })
    await expect(createCheckoutSession(INPUT)).rejects.toThrow('Stripe is unavailable')
    expect(stripe.sessionsCreate).not.toHaveBeenCalled()
  })

  it.each([
    ['another amount', { ...PLAN_PRICE, unit_amount: 1900 }],
    ['another currency', { ...PLAN_PRICE, currency: 'usd' }],
    ['a yearly price', { ...PLAN_PRICE, recurring: { interval: 'year', interval_count: 1 } }],
    ['a one-off price', { ...PLAN_PRICE, recurring: null }],
    ['VAT-inclusive', { ...PLAN_PRICE, tax_behavior: 'inclusive' }],
    ['of unspecified tax behaviour', { ...PLAN_PRICE, tax_behavior: 'unspecified' }],
  ])('sells nothing when the configured price is %s', async (_label, price) => {
    stripe.pricesRetrieve.mockResolvedValue(price)
    await expect(createCheckoutSession(INPUT)).rejects.toThrow(/STRIPE_PRICE_ID price_1/)
    expect(stripe.sessionsCreate).not.toHaveBeenCalled()
  })
})

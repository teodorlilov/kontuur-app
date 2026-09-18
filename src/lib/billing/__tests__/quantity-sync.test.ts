import { beforeEach, describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'

const mocks = vi.hoisted(() => ({ retrieve: vi.fn(), update: vi.fn() }))
vi.mock('../stripe', () => ({
  stripeClient: () => ({ subscriptions: { retrieve: mocks.retrieve, update: mocks.update } }),
}))

import {
  billedSubscriptionId,
  QuantityChargeError,
  syncSubscriptionQuantity,
} from '../quantity-sync'

describe('syncSubscriptionQuantity', () => {
  beforeEach(() => {
    mocks.retrieve.mockReset().mockResolvedValue({ items: { data: [{ id: 'si_1' }] } })
    mocks.update.mockReset().mockResolvedValue({})
  })

  it('charges an increase now, refusing to apply it when the charge fails', async () => {
    await syncSubscriptionQuantity('sub_1', 4, 'charge')
    expect(mocks.update).toHaveBeenCalledWith(
      'sub_1',
      {
        items: [{ id: 'si_1', quantity: 4 }],
        proration_behavior: 'always_invoice',
        payment_behavior: 'error_if_incomplete',
      },
      { idempotencyKey: expect.any(String) }
    )
  })

  it('credits a put-back and books nothing for a decrease, never below one', async () => {
    await syncSubscriptionQuantity('sub_1', 3, 'credit')
    expect(mocks.update.mock.calls[0]?.[1]).toMatchObject({
      proration_behavior: 'create_prorations',
    })
    await syncSubscriptionQuantity('sub_1', 0, 'none')
    expect(mocks.update.mock.calls[1]?.[1]).toMatchObject({
      items: [{ id: 'si_1', quantity: 1 }],
      proration_behavior: 'none',
    })
  })

  it('uses a fresh idempotency key per call, so 3→4→3→4 never replays a stale answer', async () => {
    await syncSubscriptionQuantity('sub_1', 4, 'charge')
    await syncSubscriptionQuantity('sub_1', 4, 'charge')
    const keys = mocks.update.mock.calls.map((call) => call[2]?.idempotencyKey)
    expect(keys[0]).not.toBe(keys[1])
  })

  it('turns a declined card into the sentence a person can act on', async () => {
    mocks.update.mockRejectedValue(
      new Stripe.errors.StripeCardError({ message: 'Your card was declined.', type: 'card_error' })
    )
    await expect(syncSubscriptionQuantity('sub_1', 4, 'charge')).rejects.toThrow(
      /card on file was declined: Your card was declined\./
    )
    await expect(syncSubscriptionQuantity('sub_1', 4, 'charge')).rejects.toBeInstanceOf(
      QuantityChargeError
    )
  })

  it('lets a failure on a decrease through as it is — the caller only logs it', async () => {
    mocks.update.mockRejectedValue(new Error('rate limited'))
    await expect(syncSubscriptionQuantity('sub_1', 2, 'none')).rejects.toThrow('rate limited')
  })
})

describe('billedSubscriptionId', () => {
  const agency = { stripe_subscription_id: 'sub_1' }
  it('names the subscription only while the paid plan is live', () => {
    expect(billedSubscriptionId({ plan: 'pro', state: 'active' }, agency)).toBe('sub_1')
    expect(billedSubscriptionId({ plan: 'pro', state: 'past_due' }, agency)).toBe('sub_1')
    expect(billedSubscriptionId({ plan: 'pro', state: 'locked' }, agency)).toBeNull()
    expect(billedSubscriptionId({ plan: 'trial', state: 'trial' }, agency)).toBeNull()
    expect(billedSubscriptionId({ plan: 'house', state: 'active' }, agency)).toBeNull()
    expect(billedSubscriptionId({ plan: 'pro', state: 'active' }, null)).toBeNull()
  })
})

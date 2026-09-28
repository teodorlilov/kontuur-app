import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'
import type { AdminClient } from '@/lib/supabase/admin'

const mocks = vi.hoisted(() => ({ retrieve: vi.fn(), update: vi.fn(), count: vi.fn() }))
vi.mock('../stripe', () => ({
  stripeClient: () => ({ subscriptions: { retrieve: mocks.retrieve, update: mocks.update } }),
}))
vi.mock('@/lib/queries/db', () => ({ countClientsByAgency: mocks.count }))

import {
  billedSubscriptionId,
  openSubscriptionId,
  QuantityChargeError,
  syncSubscriptionQuantity,
} from '../quantity-sync'
import { CLIENT_NOT_ADDED, QUANTITY_SYNC_BUSY } from '../copy'
import { entitlementFor } from '../entitlement'
import { paidRow, trialRow } from './fixtures'

/** Stripe's state for the one subscription: its item's quantity and period (`item()` adds the €29 price). */
const stripe = { quantity: 3, periodStart: 0, periodEnd: 0 }

function item() {
  return {
    id: 'si_1',
    quantity: stripe.quantity,
    current_period_start: stripe.periodStart,
    current_period_end: stripe.periodEnd,
    price: { unit_amount: 2900 },
  }
}

/**
 * The agencies row's quantity claim, held until released — or by someone else for the first
 * `heldElsewhere` attempts. Enough of the admin client for the claim's compare-and-set and its
 * release. WHY as: only `from/update/eq/or/select` and awaiting the release chain exist.
 */
function claimRow(heldElsewhere = 0) {
  const log: string[] = []
  let held = false
  let attempts = 0
  const admin = {
    from: () => {
      const query = {
        released: false,
        update(values: { quantity_sync_at: string | null }) {
          query.released = values.quantity_sync_at === null
          return query
        },
        eq: () => query,
        or: () => query,
        select: () => {
          attempts++
          const taken = !held && attempts > heldElsewhere
          if (taken) held = true
          log.push(taken ? 'claim' : 'busy')
          return Promise.resolve({ data: taken ? [{ id: 'a1' }] : [], error: null })
        },
        then(resolve: (value: { error: null }) => void) {
          if (query.released) {
            held = false
            log.push('release')
          }
          resolve({ error: null })
        },
      }
      return query
    },
  }
  return { admin: admin as unknown as AdminClient, log }
}

/** An add's change, its paid count paid for Stripe's current period. */
function paidNow(paid: number, direction: 'increase' | 'both' = 'increase') {
  return { direction, paid, paidFor: new Date(stripe.periodStart * 1000).toISOString() }
}

/** The bounds every Stripe request under the claim carries. */
const BOUNDED = { timeout: 10_000, maxNetworkRetries: 1 }

/** The quantities Stripe was asked to write, with how each was billed. */
function writes() {
  return mocks.update.mock.calls.map((call) => [
    call[1].items[0].quantity,
    call[1].proration_behavior,
  ])
}

describe('syncSubscriptionQuantity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const now = Math.floor(Date.now() / 1000)
    Object.assign(stripe, {
      quantity: 3,
      periodStart: now - 5 * 86_400,
      periodEnd: now + 25 * 86_400,
    })
    mocks.retrieve.mockImplementation(async () => ({ items: { data: [item()] } }))
    mocks.update.mockImplementation(
      async (_id: string, params: { items: { quantity: number }[] }) => {
        stripe.quantity = params.items[0]!.quantity
        return {}
      }
    )
  })

  afterEach(() => vi.useRealTimers())

  it('writes nothing for an add when Stripe already bills the count', async () => {
    mocks.count.mockResolvedValue(3)
    await syncSubscriptionQuantity(claimRow().admin, 'a1', 'sub_1', paidNow(3))
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('charges an added client at once, refusing to apply it when the charge fails', async () => {
    mocks.count.mockResolvedValue(4)
    await syncSubscriptionQuantity(claimRow().admin, 'a1', 'sub_1', paidNow(3))
    expect(mocks.update).toHaveBeenCalledWith(
      'sub_1',
      {
        items: [{ id: 'si_1', quantity: 4 }],
        proration_behavior: 'always_invoice',
        payment_behavior: 'error_if_incomplete',
      },
      { ...BOUNDED, idempotencyKey: expect.any(String) }
    )
    expect(mocks.retrieve).toHaveBeenCalledWith('sub_1', {}, BOUNDED)
  })

  it('restores a client already paid for uncharged, and charges only above it', async () => {
    stripe.quantity = 2
    mocks.count.mockResolvedValue(4)
    await syncSubscriptionQuantity(claimRow().admin, 'a1', 'sub_1', paidNow(3))
    expect(writes()).toEqual([
      [3, 'none'],
      [4, 'always_invoice'],
    ])
  })

  it('re-adds a client within the count paid for at no charge', async () => {
    stripe.quantity = 2
    mocks.count.mockResolvedValue(3)
    await syncSubscriptionQuantity(claimRow().admin, 'a1', 'sub_1', paidNow(3))
    expect(writes()).toEqual([[3, 'none']])
  })

  it('bills an add on the renewal when what is left of the period is worth less than Stripe’s minimum charge', async () => {
    stripe.periodEnd = Math.floor(Date.now() / 1000) + 60
    stripe.periodStart = stripe.periodEnd - 30 * 86_400
    mocks.count.mockResolvedValue(4)
    await syncSubscriptionQuantity(claimRow().admin, 'a1', 'sub_1', paidNow(3))
    expect(writes()).toEqual([[4, 'create_prorations']])
  })

  it('lowers the quantity for a deleted client without charging or crediting, and never below one', async () => {
    mocks.count.mockResolvedValue(2)
    await syncSubscriptionQuantity(claimRow().admin, 'a1', 'sub_1', { direction: 'decrease' })
    mocks.count.mockResolvedValue(0)
    await syncSubscriptionQuantity(claimRow().admin, 'a1', 'sub_1', { direction: 'decrease' })
    expect(writes()).toEqual([
      [2, 'none'],
      [1, 'none'],
    ])
  })

  it('never raises the quantity on a decrease, nor lowers it on an increase', async () => {
    mocks.count.mockResolvedValue(5)
    await syncSubscriptionQuantity(claimRow().admin, 'a1', 'sub_1', { direction: 'decrease' })
    mocks.count.mockResolvedValue(1)
    await syncSubscriptionQuantity(claimRow().admin, 'a1', 'sub_1', paidNow(3))
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('moves either way for a new subscription', async () => {
    mocks.count.mockResolvedValue(2)
    await syncSubscriptionQuantity(claimRow().admin, 'a1', 'sub_1', paidNow(3, 'both'))
    mocks.count.mockResolvedValue(3)
    await syncSubscriptionQuantity(claimRow().admin, 'a1', 'sub_1', paidNow(2, 'both'))
    expect(writes()).toEqual([
      [2, 'none'],
      [3, 'always_invoice'],
    ])
  })

  it('counts the clients under the claim, and gives the claim back afterwards', async () => {
    const { admin, log } = claimRow()
    mocks.count.mockImplementation(async () => {
      log.push('count')
      return 4
    })
    await syncSubscriptionQuantity(admin, 'a1', 'sub_1', paidNow(3))
    expect(log).toEqual(['claim', 'count', 'release'])
  })

  it('turns any Stripe failure on an add — the read included — into a sentence a person can act on', async () => {
    mocks.count.mockResolvedValue(4)
    const reset = new Error('connection reset')
    mocks.retrieve.mockRejectedValueOnce(reset)
    const refused = await syncSubscriptionQuantity(
      claimRow().admin,
      'a1',
      'sub_1',
      paidNow(3)
    ).catch((err: unknown) => err)
    expect(refused).toEqual(new QuantityChargeError(CLIENT_NOT_ADDED))
    expect(refused).toHaveProperty('cause', reset)

    mocks.update.mockRejectedValueOnce(
      new Stripe.errors.StripeCardError({ message: 'Your card was declined.', type: 'card_error' })
    )
    await expect(
      syncSubscriptionQuantity(claimRow().admin, 'a1', 'sub_1', paidNow(3))
    ).rejects.toThrow(/card on file was declined: Your card was declined\./)
  })

  it('lets a failure on a decrease through as it is — the caller only logs it — and still releases', async () => {
    const { admin, log } = claimRow()
    mocks.count.mockResolvedValue(2)
    mocks.update.mockRejectedValueOnce(new Error('rate limited'))
    await expect(
      syncSubscriptionQuantity(admin, 'a1', 'sub_1', { direction: 'decrease' })
    ).rejects.toThrow('rate limited')
    expect(log.at(-1)).toBe('release')
  })

  it('uses a fresh idempotency key per write, so 3→4→3→4 never replays a stale answer', async () => {
    mocks.count.mockResolvedValue(4)
    await syncSubscriptionQuantity(claimRow().admin, 'a1', 'sub_1', paidNow(3))
    stripe.quantity = 3
    await syncSubscriptionQuantity(claimRow().admin, 'a1', 'sub_1', paidNow(3))
    const keys = mocks.update.mock.calls.map((call) => call[2]?.idempotencyKey)
    expect(keys[0]).not.toBe(keys[1])
  })

  it('serialises two changes, so the last write is the true count and none lowers what Stripe holds', async () => {
    vi.useFakeTimers()
    const { admin, log } = claimRow()
    mocks.count.mockResolvedValueOnce(4).mockResolvedValueOnce(5)
    const first = syncSubscriptionQuantity(admin, 'a1', 'sub_1', paidNow(3))
    const second = syncSubscriptionQuantity(admin, 'a1', 'sub_1', paidNow(3))
    await first
    await vi.advanceTimersByTimeAsync(1_000)
    await second
    expect(log).toEqual(['claim', 'busy', 'release', 'claim', 'release'])
    expect(writes()).toEqual([
      [4, 'always_invoice'],
      [5, 'always_invoice'],
    ])
  })

  it('waits out a slow holder rather than undoing a client it may have charged for, and finds the count already billed', async () => {
    vi.useFakeTimers()
    const { admin, log } = claimRow(20)
    mocks.count.mockResolvedValue(4)
    stripe.quantity = 4
    const waiting = syncSubscriptionQuantity(admin, 'a1', 'sub_1', paidNow(3))
    await vi.advanceTimersByTimeAsync(20_000)
    await waiting
    expect(log.filter((entry) => entry === 'busy')).toHaveLength(20)
    expect(log.slice(-2)).toEqual(['claim', 'release'])
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('gives way with a sentence only once the claim has stayed busy past its stale window', async () => {
    vi.useFakeTimers()
    const { admin, log } = claimRow(1_000)
    const refused = syncSubscriptionQuantity(admin, 'a1', 'sub_1', paidNow(3))
    const settled = expect(refused).rejects.toEqual(new QuantityChargeError(QUANTITY_SYNC_BUSY))
    await vi.advanceTimersByTimeAsync(70_000)
    await settled
    expect(log).toHaveLength(71)
    expect(mocks.count).not.toHaveBeenCalled()
    expect(mocks.retrieve).not.toHaveBeenCalled()
  })

  it('honours the paid count only for the period it was paid for, since Stripe moves the period before a renewal is paid', async () => {
    stripe.quantity = 2
    mocks.count.mockResolvedValue(3)
    const lastPeriod = new Date((stripe.periodStart - 30 * 86_400) * 1000).toISOString()
    await syncSubscriptionQuantity(claimRow().admin, 'a1', 'sub_1', {
      direction: 'increase',
      paid: 3,
      paidFor: lastPeriod,
    })
    expect(writes()).toEqual([[3, 'always_invoice']])
  })

  it('leaves an over-count to the next paid period, which lowers it without a charge; an add before then writes nothing', async () => {
    stripe.quantity = 5
    mocks.count.mockResolvedValue(3)
    mocks.update.mockRejectedValueOnce(new Error('rate limited'))
    await expect(
      syncSubscriptionQuantity(claimRow().admin, 'a1', 'sub_1', paidNow(5, 'both'))
    ).rejects.toThrow('rate limited')
    mocks.count.mockResolvedValue(4)
    await syncSubscriptionQuantity(claimRow().admin, 'a1', 'sub_1', paidNow(5))
    await syncSubscriptionQuantity(claimRow().admin, 'a1', 'sub_1', { direction: 'decrease' })
    expect(writes()).toEqual([
      [3, 'none'],
      [4, 'none'],
    ])
    expect(stripe.quantity).toBe(4)
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

describe('openSubscriptionId', () => {
  const NOW = new Date('2026-09-14T12:00:00Z')
  const agency = { stripe_subscription_id: 'sub_1' }
  const at = (row: Parameters<typeof entitlementFor>[0]) =>
    openSubscriptionId(entitlementFor(row, NOW), agency)

  it('names the subscription while it is open, locked or house included, since a decrease never charges', () => {
    expect(at(paidRow(NOW))).toBe('sub_1')
    expect(
      at(paidRow(NOW, { subscription_status: 'past_due', past_due_since: '2026-09-12T00:00:00Z' }))
    ).toBe('sub_1')
    const lockedOpen = paidRow(NOW, {
      subscription_status: 'unpaid',
      past_due_since: '2026-08-01T00:00:00Z',
    })
    expect(entitlementFor(lockedOpen, NOW).state).toBe('locked')
    expect(at(lockedOpen)).toBe('sub_1')
    expect(at(paidRow(NOW, { cancel_at_period_end: true }))).toBe('sub_1')
    expect(at(paidRow(NOW, { plan: 'house' }))).toBe('sub_1')
  })

  it('names nothing once the subscription has ended, or when there is none', () => {
    expect(at(paidRow(NOW, { subscription_status: 'canceled' }))).toBeNull()
    expect(at(paidRow(NOW, { subscription_status: 'incomplete_expired' }))).toBeNull()
    expect(at(trialRow(NOW))).toBeNull()
    expect(openSubscriptionId({ subscriptionOpen: true }, null)).toBeNull()
  })
})

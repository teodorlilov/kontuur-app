import { beforeEach, describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'
import type { AdminClient } from '@/lib/supabase/admin'

const mocks = vi.hoisted(() => ({ retrieve: vi.fn(), update: vi.fn(), snapshot: vi.fn() }))
vi.mock('../stripe', () => ({
  stripeClient: () => ({ subscriptions: { retrieve: mocks.retrieve, update: mocks.update } }),
}))
vi.mock('../subscription-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../subscription-store')>()),
  applySubscriptionSnapshot: mocks.snapshot,
}))

import { SlotChangeError, SlotSnapshotError, setClientSlots } from '../client-slots'
import {
  SLOTS_BANK_CONFIRMATION,
  SLOTS_BUSY,
  SLOTS_CHANGED_ELSEWHERE,
  SLOTS_RENEWAL_PENDING,
} from '../copy'

/** Stripe's state for the one subscription: its item's quantity and period, in Unix seconds. */
const stripe = { quantity: 3, periodStart: 0, periodEnd: 0, invoiceStatus: 'paid' }

function item() {
  return {
    id: 'si_1',
    quantity: stripe.quantity,
    current_period_start: stripe.periodStart,
    current_period_end: stripe.periodEnd,
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

/** A change as the person saw it, in Stripe's current period. */
function request(from: number, to: number, paid: number) {
  return { from, to, paid, periodStart: new Date(stripe.periodStart * 1000).toISOString() }
}

/** The quantities Stripe was asked to write, with how each was billed. */
function writes() {
  return mocks.update.mock.calls.map((call) => [
    call[1].items[0].quantity,
    call[1].proration_behavior,
  ])
}

/** The invoice the snapshot was handed, if any. */
function snapshotInvoice() {
  return mocks.snapshot.mock.calls[0]?.[2]
}

const BOUNDED = { timeout: 10_000, maxNetworkRetries: 1 }

describe('setClientSlots', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    const now = Math.floor(Date.now() / 1000)
    Object.assign(stripe, {
      quantity: 3,
      periodStart: now - 5 * 86_400,
      periodEnd: now + 25 * 86_400,
      invoiceStatus: 'paid',
    })
    mocks.retrieve.mockImplementation(async () => ({ items: { data: [item()] } }))
    mocks.update.mockImplementation(
      async (_id: string, params: { items: { quantity: number }[] }) => {
        stripe.quantity = params.items[0]!.quantity
        return {
          id: 'sub_1',
          items: { data: [item()] },
          latest_invoice: { id: 'in_1', status: stripe.invoiceStatus },
        }
      }
    )
    mocks.snapshot.mockResolvedValue({ agencyId: 'a1', outcome: 'written' })
  })

  it('raises with one charged write and hands the snapshot its paid invoice', async () => {
    const { admin } = claimRow()
    expect(await setClientSlots(admin, 'a1', 'sub_1', request(3, 4, 3))).toBe('charged')
    expect(writes()).toEqual([[4, 'always_invoice']])
    expect(snapshotInvoice()).toMatchObject({ id: 'in_1', status: 'paid' })
  })

  it('charges a raise past the paid count in one write, from wherever the count stands', async () => {
    stripe.quantity = 2
    expect(await setClientSlots(claimRow().admin, 'a1', 'sub_1', request(2, 5, 3))).toBe('charged')
    expect(writes()).toEqual([[5, 'always_invoice']])
  })

  it('restores up to the paid count for nothing', async () => {
    stripe.quantity = 2
    expect(await setClientSlots(claimRow().admin, 'a1', 'sub_1', request(2, 3, 3))).toBe('restored')
    expect(writes()).toEqual([[3, 'none']])
    expect(snapshotInvoice()).toBeUndefined()
  })

  it('lowers with no proration, so nothing is refunded', async () => {
    expect(await setClientSlots(claimRow().admin, 'a1', 'sub_1', request(3, 2, 3))).toBe('lowered')
    expect(writes()).toEqual([[2, 'none']])
    expect(snapshotInvoice()).toBeUndefined()
  })

  it("leaves a charge under Stripe's minimum on the renewal invoice", async () => {
    stripe.periodEnd = Math.floor(Date.now() / 1000) + 60
    expect(await setClientSlots(claimRow().admin, 'a1', 'sub_1', request(3, 4, 3))).toBe(
      'on_renewal'
    )
    expect(writes()).toEqual([[4, 'create_prorations']])
    expect(snapshotInvoice()).toBeUndefined()
  })

  it('answers a count that does not move before taking the claim or asking Stripe', async () => {
    const { admin, log } = claimRow()
    expect(await setClientSlots(admin, 'a1', 'sub_1', request(3, 3, 3))).toBe('same')
    expect(log).toEqual([])
    expect(mocks.retrieve).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.snapshot).not.toHaveBeenCalled()
  })

  it('does not hand the snapshot an invoice that is not paid', async () => {
    stripe.invoiceStatus = 'open'
    await setClientSlots(claimRow().admin, 'a1', 'sub_1', request(3, 4, 3))
    expect(snapshotInvoice()).toBeUndefined()
  })

  it('refuses a count another window already changed, writing Stripe’s count to the row first', async () => {
    stripe.quantity = 4
    const { admin } = claimRow()
    await expect(setClientSlots(admin, 'a1', 'sub_1', request(3, 5, 3))).rejects.toThrow(
      SLOTS_CHANGED_ELSEWHERE
    )
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.snapshot).toHaveBeenCalledWith(admin, {
      items: { data: [expect.objectContaining({ quantity: 4 })] },
    })
  })

  it('reports a change Stripe made as made when the row cannot be written after it', async () => {
    mocks.snapshot.mockRejectedValueOnce(new Error('row write failed'))
    const change = setClientSlots(claimRow().admin, 'a1', 'sub_1', request(3, 4, 3))
    await expect(change).rejects.toBeInstanceOf(SlotSnapshotError)
    await expect(change).rejects.toMatchObject({ outcome: 'charged' })
    expect(writes()).toEqual([[4, 'always_invoice']])
  })

  it("refuses while a renewal has moved Stripe's period ahead of the row's", async () => {
    const stale = { ...request(3, 4, 3), periodStart: '2026-08-01T00:00:00.000Z' }
    await expect(setClientSlots(claimRow().admin, 'a1', 'sub_1', stale)).rejects.toThrow(
      SLOTS_RENEWAL_PENDING
    )
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("answers a declined card in the card's words and writes no snapshot", async () => {
    mocks.update.mockRejectedValueOnce(
      new Stripe.errors.StripeCardError({ message: 'Your card was declined.', type: 'card_error' })
    )
    const change = setClientSlots(claimRow().admin, 'a1', 'sub_1', request(3, 4, 3))
    await expect(change).rejects.toBeInstanceOf(SlotChangeError)
    await expect(change).rejects.toThrow(/card on file was declined: Your card was declined\./)
    expect(mocks.snapshot).not.toHaveBeenCalled()
  })

  it('says plainly when the bank asks to confirm the payment, which the app cannot take yet', async () => {
    mocks.update.mockRejectedValueOnce(
      new Stripe.errors.StripeCardError({
        message: 'This payment requires additional user action before it can be completed.',
        type: 'card_error',
        code: 'invoice_payment_intent_requires_action',
      })
    )
    const change = setClientSlots(claimRow().admin, 'a1', 'sub_1', request(3, 4, 3))
    await expect(change).rejects.toThrow(SLOTS_BANK_CONFIRMATION)
    expect(mocks.snapshot).not.toHaveBeenCalled()
  })

  it('lets any other Stripe failure through as it is', async () => {
    mocks.update.mockRejectedValueOnce(new Error('Stripe is unavailable'))
    const change = setClientSlots(claimRow().admin, 'a1', 'sub_1', request(3, 4, 3))
    await expect(change).rejects.not.toBeInstanceOf(SlotChangeError)
    await expect(change).rejects.toThrow('Stripe is unavailable')
  })

  it('gives way at once while another change holds the claim, asking Stripe nothing', async () => {
    const { admin, log } = claimRow(1)
    await expect(setClientSlots(admin, 'a1', 'sub_1', request(3, 4, 3))).rejects.toThrow(SLOTS_BUSY)
    expect(log).toEqual(['busy'])
    expect(mocks.retrieve).not.toHaveBeenCalled()
  })

  it('releases the claim after a change and after a failure', async () => {
    const done = claimRow()
    await setClientSlots(done.admin, 'a1', 'sub_1', request(3, 4, 3))
    expect(done.log).toEqual(['claim', 'release'])

    stripe.quantity = 3
    mocks.update.mockRejectedValueOnce(new Error('Stripe is unavailable'))
    const failed = claimRow()
    await expect(setClientSlots(failed.admin, 'a1', 'sub_1', request(3, 4, 3))).rejects.toThrow()
    expect(failed.log).toEqual(['claim', 'release'])
  })

  it('bounds every request and expands the invoice, leaving the idempotency key to the SDK', async () => {
    await setClientSlots(claimRow().admin, 'a1', 'sub_1', request(3, 4, 3))
    expect(mocks.retrieve).toHaveBeenCalledWith('sub_1', {}, BOUNDED)
    const [first] = mocks.update.mock.calls
    expect(first![1]).toMatchObject({
      payment_behavior: 'error_if_incomplete',
      expand: ['latest_invoice'],
    })
    expect(first![2]).toEqual(BOUNDED)
  })
})

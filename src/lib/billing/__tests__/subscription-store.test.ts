import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import type { createAdminSupabaseClient } from '@/lib/supabase/admin'

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  customersCreate: vi.fn(),
  subscriptionsUpdate: vi.fn(),
  subscriptionsRetrieve: vi.fn(),
  subscriptionsCancel: vi.fn(),
  invoicesList: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }))
vi.mock('../stripe', () => ({
  stripeClient: () => ({
    customers: { create: mocks.customersCreate },
    subscriptions: {
      update: mocks.subscriptionsUpdate,
      retrieve: mocks.subscriptionsRetrieve,
      cancel: mocks.subscriptionsCancel,
    },
    invoices: { list: mocks.invoicesList },
  }),
}))

import {
  applySubscriptionSnapshot,
  ensureStripeCustomer,
  setPlanEnding,
} from '../subscription-store'

interface Row {
  stripe_subscription_id: string | null
  subscription_status: string | null
  past_due_since: string | null
}

/**
 * A recorder in place of the admin client: the one read answers `row`, every update is kept.
 * Cast through `unknown` because only `from/select/eq/maybeSingle/update` exist.
 */
function makeAdmin(row: Row | null) {
  const updates: Array<{ table: string; values: Record<string, unknown>; id: string }> = []
  const admin = {
    from(table: string) {
      const query = {
        select: () => query,
        eq: (_column: string, id: string) => {
          if (query.pending) updates.push({ table, values: query.pending, id })
          query.pending = null
          return query
        },
        maybeSingle: () => Promise.resolve({ data: row, error: null }),
        update: (values: Record<string, unknown>) => {
          query.pending = values
          return query
        },
        pending: null as Record<string, unknown> | null,
        then(resolve: (value: { error: null }) => void) {
          resolve({ error: null })
        },
      }
      return query
    },
  }
  return { admin: admin as unknown as ReturnType<typeof createAdminSupabaseClient>, updates }
}

/** The item's period in Stripe's seconds: 2025-10-01T00:00:00Z to 2025-10-31T00:00:00Z. */
const PERIOD_START = 1_759_276_800
const PERIOD_END = 1_761_868_800

/** A subscription as the snapshot reads it. WHY as: the SDK type carries sixty fields; the snapshot reads six. */
function subscription(overrides: Partial<Stripe.Subscription> = {}, quantity = 3) {
  return {
    id: 'sub_1',
    status: 'active',
    cancel_at_period_end: false,
    metadata: { agency_id: 'a1' },
    items: {
      data: [
        {
          id: 'si_1',
          quantity,
          current_period_start: PERIOD_START,
          current_period_end: PERIOD_END,
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription
}

/** One invoice line on the subscription's item: its count, its sign, its kind, and the period end it bills to. */
function line(quantity: number, amount: number, proration: boolean, periodEnd = PERIOD_END) {
  return {
    quantity,
    amount,
    period: { start: PERIOD_START, end: periodEnd },
    parent: { subscription_item_details: { subscription_item: 'si_1', proration } },
  }
}

/** A paid invoice. WHY as: the snapshot reads each line's item, count, sign, kind and period. */
function invoice(...lines: ReturnType<typeof line>[]): Stripe.Invoice {
  return { lines: { data: lines } } as unknown as Stripe.Invoice
}

/** Stripe's paid invoices of the period, as `invoices.list` answers. */
function paidInPeriod(...invoices: Stripe.Invoice[]) {
  mocks.invoicesList.mockResolvedValue({ data: invoices })
}

const RENEWAL_FOR_3 = invoice(line(3, 8700, false))
const ADDED_FOURTH = invoice(line(3, -2000, true), line(4, 2700, true))

const FRESH: Row = {
  stripe_subscription_id: null,
  subscription_status: null,
  past_due_since: null,
}
const KNOWN: Row = {
  stripe_subscription_id: 'sub_1',
  subscription_status: 'active',
  past_due_since: null,
}

describe('applySubscriptionSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    paidInPeriod()
  })

  it('ignores a subscription that carries no agency — not made by this app', async () => {
    const { admin, updates } = makeAdmin(FRESH)
    const result = await applySubscriptionSnapshot(admin, subscription({ metadata: {} }))
    expect(result).toEqual({ agencyId: null, outcome: 'ignored' })
    expect(updates).toEqual([])
  })

  it('reports a deleted workspace as no_workspace with no agency id, and writes nothing', async () => {
    const { admin, updates } = makeAdmin(null)
    const result = await applySubscriptionSnapshot(admin, subscription())
    expect(result).toEqual({ agencyId: null, outcome: 'no_workspace' })
    expect(updates).toEqual([])
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it('starts a new subscription with the period and quantity it carries, never the plan, and busts the cached row at once', async () => {
    const { admin, updates } = makeAdmin(FRESH)
    const result = await applySubscriptionSnapshot(admin, subscription())

    expect(result).toEqual({ agencyId: 'a1', outcome: 'started' })
    expect(updates).toEqual([
      {
        table: 'agencies',
        id: 'a1',
        values: {
          subscription_status: 'active',
          stripe_subscription_id: 'sub_1',
          cancel_at_period_end: false,
          past_due_since: null,
          current_period_start: '2025-10-01T00:00:00.000Z',
          current_period_end: '2025-10-31T00:00:00.000Z',
          subscription_quantity: 3,
        },
      },
    ])
    expect(mocks.revalidateTag).toHaveBeenCalledWith('agencies', { expire: 0 })
  })

  it('moves the period only for a paid invoice of the current period — never a charge inside it or an event', async () => {
    const event = makeAdmin(KNOWN)
    await applySubscriptionSnapshot(event.admin, subscription())
    expect(event.updates[0]?.values).not.toHaveProperty('current_period_start')

    const charge = makeAdmin(KNOWN)
    await applySubscriptionSnapshot(charge.admin, subscription(), ADDED_FOURTH)
    expect(charge.updates[0]?.values).not.toHaveProperty('current_period_start')

    const renewal = makeAdmin(KNOWN)
    const paid = await applySubscriptionSnapshot(renewal.admin, subscription(), RENEWAL_FOR_3)
    expect(paid.outcome).toBe('period_paid')
    expect(renewal.updates[0]?.values).toMatchObject({
      current_period_start: '2025-10-01T00:00:00.000Z',
      current_period_end: '2025-10-31T00:00:00.000Z',
    })
  })

  it('does not move the period for an earlier period’s renewal delivered late, so a failed renewal gets no fresh allowance', async () => {
    const { admin, updates } = makeAdmin(KNOWN)
    await applySubscriptionSnapshot(
      admin,
      subscription({ status: 'past_due' }),
      invoice(line(3, 8700, false, PERIOD_START))
    )
    expect(updates[0]?.values).not.toHaveProperty('current_period_start')
  })

  it('reads the count paid for from the period’s paid invoices, not the subscription', async () => {
    paidInPeriod(RENEWAL_FOR_3)
    const { admin, updates } = makeAdmin(KNOWN)
    await applySubscriptionSnapshot(admin, subscription({}, 2), RENEWAL_FOR_3)
    expect(mocks.invoicesList).toHaveBeenCalledWith({
      subscription: 'sub_1',
      status: 'paid',
      created: { gte: PERIOD_START },
      limit: 100,
    })
    expect(updates[0]?.values.subscription_quantity).toBe(3)
  })

  it('counts a client added and charged mid-period by the charge for 4, not the credit for 3, whichever invoice is delivered last', async () => {
    paidInPeriod(RENEWAL_FOR_3, ADDED_FOURTH)
    for (const delivered of [ADDED_FOURTH, RENEWAL_FOR_3]) {
      const { admin, updates } = makeAdmin(KNOWN)
      await applySubscriptionSnapshot(admin, subscription({}, 4), delivered)
      expect(updates[0]?.values.subscription_quantity).toBe(4)
    }
  })

  it('ignores a charge billed to an earlier period', async () => {
    paidInPeriod(RENEWAL_FOR_3, invoice(line(4, 2700, true, PERIOD_START)))
    const { admin, updates } = makeAdmin(KNOWN)
    await applySubscriptionSnapshot(admin, subscription(), RENEWAL_FOR_3)
    expect(updates[0]?.values.subscription_quantity).toBe(3)
  })

  it('leaves the paid count alone while no invoice of the period is paid, and on any event', async () => {
    const unpaid = makeAdmin(KNOWN)
    await applySubscriptionSnapshot(unpaid.admin, subscription({}, 1), ADDED_FOURTH)
    expect(unpaid.updates[0]?.values).not.toHaveProperty('subscription_quantity')

    mocks.invoicesList.mockClear()
    const event = makeAdmin(KNOWN)
    await applySubscriptionSnapshot(event.admin, subscription({}, 1))
    expect(event.updates[0]?.values).not.toHaveProperty('subscription_quantity')
    expect(mocks.invoicesList).not.toHaveBeenCalled()
  })

  it('stamps past_due_since when the subscription first reads past_due, keeps it, and clears it after', async () => {
    const first = makeAdmin(KNOWN)
    await applySubscriptionSnapshot(first.admin, subscription({ status: 'past_due' }))
    expect(typeof first.updates[0]?.values.past_due_since).toBe('string')

    const since = '2025-09-20T00:00:00.000Z'
    const again = makeAdmin({ ...KNOWN, subscription_status: 'past_due', past_due_since: since })
    await applySubscriptionSnapshot(again.admin, subscription({ status: 'past_due' }))
    expect(again.updates[0]?.values.past_due_since).toBe(since)

    const recovered = makeAdmin({
      ...KNOWN,
      subscription_status: 'past_due',
      past_due_since: since,
    })
    await applySubscriptionSnapshot(recovered.admin, subscription())
    expect(recovered.updates[0]?.values.past_due_since).toBeNull()
  })

  it('never stamps past_due_since while the subscription stays active — a failed pro-rata charge leaves it active', async () => {
    const { admin, updates } = makeAdmin(KNOWN)
    await applySubscriptionSnapshot(admin, subscription())
    expect(updates[0]?.values.past_due_since).toBeNull()
  })

  it('never writes the plan, so a house workspace stays house', async () => {
    const { admin, updates } = makeAdmin(KNOWN)
    await applySubscriptionSnapshot(admin, subscription())
    expect(updates[0]?.values).not.toHaveProperty('plan')
  })

  it('lets a new subscription take the row once the stored one has ended', async () => {
    const { admin, updates } = makeAdmin({
      ...KNOWN,
      stripe_subscription_id: 'sub_old',
      subscription_status: 'canceled',
    })
    const result = await applySubscriptionSnapshot(admin, subscription())
    expect(result.outcome).toBe('started')
    expect(updates[0]?.values.stripe_subscription_id).toBe('sub_1')
    expect(mocks.subscriptionsRetrieve).not.toHaveBeenCalled()
  })

  it('asks Stripe when the row still shows the old subscription open, and takes the row if it ended', async () => {
    mocks.subscriptionsRetrieve.mockResolvedValue({ id: 'sub_old', status: 'canceled' })
    const { admin, updates } = makeAdmin({ ...KNOWN, stripe_subscription_id: 'sub_old' })
    const result = await applySubscriptionSnapshot(admin, subscription())
    expect(mocks.subscriptionsRetrieve).toHaveBeenCalledWith('sub_old')
    expect(result.outcome).toBe('started')
    expect(updates[0]?.values.stripe_subscription_id).toBe('sub_1')
  })

  it('ignores the old subscription’s late event once the new one holds the row', async () => {
    const { admin, updates } = makeAdmin(KNOWN)
    const result = await applySubscriptionSnapshot(
      admin,
      subscription({ id: 'sub_old', status: 'canceled' })
    )
    expect(result).toEqual({ agencyId: 'a1', outcome: 'ignored' })
    expect(updates).toEqual([])
  })

  it('writes nothing for a second open subscription, and hands both ids to the caller’s error log', async () => {
    mocks.subscriptionsRetrieve.mockResolvedValue({ id: 'sub_old', status: 'active' })
    const { admin, updates } = makeAdmin({ ...KNOWN, stripe_subscription_id: 'sub_old' })
    const result = await applySubscriptionSnapshot(admin, subscription())
    expect(result).toEqual({
      agencyId: 'a1',
      outcome: 'conflict',
      detail: 'sub_1 arrived while sub_old is open; nothing written',
      level: 'error',
    })
    expect(updates).toEqual([])
  })
})

describe('ensureStripeCustomer', () => {
  beforeEach(() => {
    mocks.customersCreate.mockReset().mockResolvedValue({ id: 'cus_new' })
    vi.unstubAllEnvs()
  })

  it('returns the remembered customer without asking Stripe', async () => {
    const { admin, updates } = makeAdmin(null)
    const id = await ensureStripeCustomer(admin, {
      id: 'a1',
      name: 'Acme',
      stripe_customer_id: 'cus_1',
    })
    expect(id).toBe('cus_1')
    expect(mocks.customersCreate).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it('creates the customer once, keyed on the workspace, and writes the id onto the row', async () => {
    vi.stubEnv('STRIPE_TEST_CLOCK', 'clock_1')
    const { admin, updates } = makeAdmin(null)
    const id = await ensureStripeCustomer(admin, {
      id: 'a1',
      name: 'Acme',
      stripe_customer_id: null,
    })
    expect(id).toBe('cus_new')
    expect(mocks.customersCreate).toHaveBeenCalledWith(
      { name: 'Acme', metadata: { agency_id: 'a1' }, test_clock: 'clock_1' },
      { idempotencyKey: 'customer:a1' }
    )
    expect(updates).toEqual([
      { table: 'agencies', id: 'a1', values: { stripe_customer_id: 'cus_new' } },
    ])
  })
})

describe('setPlanEnding', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets a running plan to end at its period end and writes what Stripe answers', async () => {
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription())
    mocks.subscriptionsUpdate.mockResolvedValue(subscription({ cancel_at_period_end: true }))
    const { admin, updates } = makeAdmin(KNOWN)
    expect(await setPlanEnding(admin, 'sub_1', true)).toEqual({ endedNow: false })
    expect(mocks.subscriptionsUpdate).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true })
    expect(mocks.subscriptionsCancel).not.toHaveBeenCalled()
    expect(updates[0]?.values).toMatchObject({ cancel_at_period_end: true })
    expect(mocks.revalidateTag).toHaveBeenCalledWith('agencies', { expire: 0 })
  })

  it('cancels at once a plan Stripe says failed its renewal, even when the row still says active', async () => {
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription({ status: 'past_due' }))
    mocks.subscriptionsCancel.mockResolvedValue(subscription({ status: 'canceled' }))
    const { admin, updates } = makeAdmin(KNOWN)
    expect(await setPlanEnding(admin, 'sub_1', true)).toEqual({ endedNow: true })
    expect(mocks.subscriptionsCancel).toHaveBeenCalledWith('sub_1')
    expect(mocks.subscriptionsUpdate).not.toHaveBeenCalled()
    expect(updates[0]?.values).toMatchObject({ subscription_status: 'canceled' })
  })

  it('keeps a plan by clearing the flag, without asking for its status', async () => {
    mocks.subscriptionsUpdate.mockResolvedValue(subscription())
    const { admin } = makeAdmin(KNOWN)
    expect(await setPlanEnding(admin, 'sub_1', false)).toEqual({ endedNow: false })
    expect(mocks.subscriptionsRetrieve).not.toHaveBeenCalled()
    expect(mocks.subscriptionsUpdate).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: false })
  })
})

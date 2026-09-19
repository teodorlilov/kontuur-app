import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import type { createAdminSupabaseClient } from '@/lib/supabase/admin'

const mocks = vi.hoisted(() => ({ revalidateTag: vi.fn(), customersCreate: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }))
vi.mock('../stripe', () => ({
  stripeClient: () => ({ customers: { create: mocks.customersCreate } }),
}))

import { applySubscriptionSnapshot, ensureStripeCustomer } from '../subscription-store'

interface Row {
  stripe_subscription_id: string | null
  current_period_start: string | null
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

const PERIOD_START = 1_759_276_800 // 2025-10-01T00:00:00Z
const PERIOD_END = 1_761_868_800 // 2025-10-31T00:00:00Z

function subscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  // WHY as: the SDK type carries sixty fields; the snapshot reads six.
  return {
    id: 'sub_1',
    status: 'active',
    cancel_at_period_end: false,
    metadata: { agency_id: 'a1' },
    items: {
      data: [
        {
          id: 'si_1',
          quantity: 3,
          current_period_start: PERIOD_START,
          current_period_end: PERIOD_END,
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription
}

const FRESH: Row = {
  stripe_subscription_id: null,
  current_period_start: null,
  past_due_since: null,
}
const KNOWN: Row = {
  stripe_subscription_id: 'sub_1',
  current_period_start: '2025-09-01T00:00:00.000Z',
  past_due_since: null,
}

describe('applySubscriptionSnapshot', () => {
  beforeEach(() => mocks.revalidateTag.mockReset())

  it('ignores a subscription that carries no agency — not made by this app', async () => {
    const { admin, updates } = makeAdmin(FRESH)
    const result = await applySubscriptionSnapshot(
      admin,
      subscription({ metadata: {} }),
      'subscription'
    )
    expect(result).toEqual({ agencyId: null, outcome: 'ignored' })
    expect(updates).toEqual([])
  })

  it('reports a deleted workspace as no_workspace with no agency id, and writes nothing', async () => {
    const { admin, updates } = makeAdmin(null)
    const result = await applySubscriptionSnapshot(admin, subscription(), 'subscription')
    expect(result).toEqual({ agencyId: null, outcome: 'no_workspace' })
    expect(updates).toEqual([])
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it('writes the plan, status, id, quantity and cancel flag, and fills a period the row has none of', async () => {
    const { admin, updates } = makeAdmin(FRESH)
    const result = await applySubscriptionSnapshot(admin, subscription(), 'subscription')

    expect(result).toEqual({ agencyId: 'a1', outcome: 'written' })
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      table: 'agencies',
      id: 'a1',
      values: {
        plan: 'pro',
        subscription_status: 'active',
        stripe_subscription_id: 'sub_1',
        subscription_quantity: 3,
        cancel_at_period_end: false,
        current_period_start: '2025-10-01T00:00:00.000Z',
        current_period_end: '2025-10-31T00:00:00.000Z',
      },
    })
    expect(mocks.revalidateTag).toHaveBeenCalledWith('agencies', 'max')
  })

  it('leaves a known period alone on a subscription event — a failed renewal must not move the bucket', async () => {
    const { admin, updates } = makeAdmin(KNOWN)
    await applySubscriptionSnapshot(admin, subscription({ status: 'past_due' }), 'subscription')
    expect(updates[0]?.values).not.toHaveProperty('current_period_start')
    expect(updates[0]?.values).not.toHaveProperty('past_due_since')
  })

  it('advances the period and clears past_due_since on a paid invoice', async () => {
    const { admin, updates } = makeAdmin({ ...KNOWN, past_due_since: '2025-09-20T00:00:00.000Z' })
    await applySubscriptionSnapshot(admin, subscription(), 'invoice_paid')
    expect(updates[0]?.values).toMatchObject({
      current_period_start: '2025-10-01T00:00:00.000Z',
      past_due_since: null,
    })
  })

  it('starts past_due_since on the first failed invoice and keeps it on the next', async () => {
    const first = makeAdmin(KNOWN)
    await applySubscriptionSnapshot(
      first.admin,
      subscription({ status: 'past_due' }),
      'invoice_failed'
    )
    expect(typeof first.updates[0]?.values.past_due_since).toBe('string')

    const again = makeAdmin({ ...KNOWN, past_due_since: '2025-09-20T00:00:00.000Z' })
    await applySubscriptionSnapshot(
      again.admin,
      subscription({ status: 'past_due' }),
      'invoice_failed'
    )
    expect(again.updates[0]?.values).not.toHaveProperty('past_due_since')
  })

  it('ignores a subscription that is not the row’s, unless it is the one just created', async () => {
    const stale = makeAdmin({ ...KNOWN, stripe_subscription_id: 'sub_new' })
    const ignored = await applySubscriptionSnapshot(stale.admin, subscription(), 'subscription')
    expect(ignored.outcome).toBe('ignored')
    expect(stale.updates).toEqual([])

    const fresh = makeAdmin({ ...KNOWN, stripe_subscription_id: 'sub_old' })
    const written = await applySubscriptionSnapshot(
      fresh.admin,
      subscription(),
      'subscription_created'
    )
    expect(written.outcome).toBe('written')
    expect(fresh.updates[0]?.values.stripe_subscription_id).toBe('sub_1')
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

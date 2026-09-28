import type { AgencyBillingColumns } from '@/lib/queries/select-columns'

const DAY_MS = 86_400_000

/** An agency's billing columns on a trial that ends a week after `now`; overrides make any other state. */
export function trialRow(
  now: Date,
  overrides: Partial<AgencyBillingColumns> = {}
): AgencyBillingColumns {
  return {
    plan: 'trial',
    mode: 'agency',
    timezone: 'Europe/Sofia',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: null,
    subscription_quantity: null,
    trial_ends_at: new Date(now.getTime() + 7 * DAY_MS).toISOString(),
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    past_due_since: null,
    ...overrides,
  }
}

/** The same workspace paying for one client in the September 2026 period, its trial long over. */
export function paidRow(
  now: Date,
  overrides: Partial<AgencyBillingColumns> = {}
): AgencyBillingColumns {
  return trialRow(now, {
    plan: 'pro',
    stripe_customer_id: 'cus_1',
    stripe_subscription_id: 'sub_1',
    subscription_status: 'active',
    subscription_quantity: 1,
    current_period_start: '2026-09-01T00:00:00Z',
    current_period_end: '2026-10-01T00:00:00Z',
    trial_ends_at: new Date(now.getTime() - 30 * DAY_MS).toISOString(),
    ...overrides,
  })
}

import { describe, expect, it } from 'vitest'
import type { AgencyBillingColumns } from '@/lib/queries/select-columns'
import { entitlementFor, noEntitlement } from '../entitlement'
import { GRACE_DAYS, PLANS, TRIAL_BRANDS, TRIAL_PER_BRAND } from '../plans'

const NOW = new Date('2026-09-13T12:00:00Z')

function daysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 86_400_000).toISOString()
}

function row(overrides: Partial<AgencyBillingColumns> = {}): AgencyBillingColumns {
  return {
    plan: 'trial',
    mode: 'agency',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: null,
    subscription_quantity: null,
    trial_ends_at: daysFromNow(7),
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    past_due_since: null,
    ...overrides,
  }
}

function paid(overrides: Partial<AgencyBillingColumns> = {}): AgencyBillingColumns {
  return row({
    plan: 'agency',
    stripe_customer_id: 'cus_1',
    stripe_subscription_id: 'sub_1',
    subscription_status: 'active',
    subscription_quantity: 5,
    current_period_start: '2026-09-01T00:00:00Z',
    current_period_end: '2026-10-01T00:00:00Z',
    trial_ends_at: daysFromNow(-30),
    ...overrides,
  })
}

describe('entitlementFor — the trial', () => {
  it('a live trial in agency mode may spend, publish and create up to three brands', () => {
    const e = entitlementFor(row(), NOW)
    expect(e.state).toBe('trial')
    expect([e.canSpend, e.canPublish, e.canCreate]).toEqual([true, true, true])
    expect(e.brands).toBe(TRIAL_BRANDS.agency)
    expect(e.limits.draft).toBe(TRIAL_PER_BRAND.draft * TRIAL_BRANDS.agency)
    expect(e.periodKey).toBe('trial')
    expect(e.resetsOn?.toISOString()).toBe(daysFromNow(7))
  })

  it('a solo trial is one brand with one brand of allowance', () => {
    const e = entitlementFor(row({ mode: 'solo' }), NOW)
    expect(e.mode).toBe('solo')
    expect(e.brands).toBe(1)
    expect(e.limits.image).toBe(TRIAL_PER_BRAND.image)
  })

  it('an ended trial inside the grace publishes but spends nothing', () => {
    const e = entitlementFor(row({ trial_ends_at: daysFromNow(-2) }), NOW)
    expect(e.state).toBe('trial_grace')
    expect([e.canSpend, e.canPublish, e.canCreate]).toEqual([false, true, false])
    expect(e.limits).toEqual({ draft: 0, image: 0, rewrite: 0 })
  })

  it('an ended trial past the grace is locked', () => {
    const e = entitlementFor(row({ trial_ends_at: daysFromNow(-(GRACE_DAYS + 1)) }), NOW)
    expect(e.state).toBe('locked')
    expect([e.canSpend, e.canPublish, e.canCreate]).toEqual([false, false, false])
  })

  it('no trial end and no subscription is locked, never open', () => {
    expect(entitlementFor(row({ trial_ends_at: null }), NOW).state).toBe('locked')
    expect(noEntitlement().state).toBe('locked')
  })

  it("a Stripe subscription still 'trialing' keeps trial limits until the first paid invoice", () => {
    const e = entitlementFor(
      paid({ subscription_status: 'trialing', trial_ends_at: daysFromNow(3) }),
      NOW
    )
    expect(e.state).toBe('trial')
    expect(e.brands).toBe(TRIAL_BRANDS.agency)
    expect(e.periodKey).toBe('trial')
  })
})

describe('entitlementFor — paid', () => {
  it('an active agency plan scales the allowance by the paid quantity and buckets by period start', () => {
    const e = entitlementFor(paid(), NOW)
    expect(e.state).toBe('active')
    expect(e.plan).toBe('agency')
    expect(e.brands).toBe(5)
    expect(e.brandsUnlimited).toBe(true)
    expect(e.limits.draft).toBe(PLANS.agency.perBrand.draft * 5)
    expect(e.periodKey).toBe('2026-09-01')
    expect(e.resetsOn?.toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it('agency never bills below its minimum quantity', () => {
    const e = entitlementFor(paid({ subscription_quantity: 1 }), NOW)
    expect(e.brands).toBe(PLANS.agency.minimumBrands)
  })

  it('starter is one brand however many the subscription says', () => {
    const e = entitlementFor(paid({ plan: 'starter', subscription_quantity: 4 }), NOW)
    expect(e.brands).toBe(1)
    expect(e.brandsUnlimited).toBe(false)
    expect(e.limits.image).toBe(PLANS.starter.perBrand.image)
  })

  it('a failed renewal keeps full access for the grace, counted from past_due_since', () => {
    const inside = entitlementFor(
      paid({ subscription_status: 'past_due', past_due_since: daysFromNow(-3) }),
      NOW
    )
    expect(inside.state).toBe('past_due')
    expect(inside.canSpend).toBe(true)
    const beyond = entitlementFor(
      paid({ subscription_status: 'past_due', past_due_since: daysFromNow(-(GRACE_DAYS + 1)) }),
      NOW
    )
    expect(beyond.state).toBe('locked')
  })

  it('past_due with no recorded start locks rather than granting an endless grace', () => {
    expect(entitlementFor(paid({ subscription_status: 'past_due' }), NOW).state).toBe('locked')
  })

  it.each(['canceled', 'unpaid', 'paused', 'incomplete', 'incomplete_expired'])(
    'a %s subscription is locked',
    (status) => {
      expect(entitlementFor(paid({ subscription_status: status }), NOW).state).toBe('locked')
    }
  )

  it('cancel at period end stays active until Stripe ends the subscription', () => {
    expect(entitlementFor(paid({ cancel_at_period_end: true }), NOW).state).toBe('active')
  })
})

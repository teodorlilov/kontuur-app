import { describe, expect, it } from 'vitest'
import type { AgencyBillingColumns } from '@/lib/queries/select-columns'
import { entitlementFor, noEntitlement } from '../entitlement'
import { GRACE_DAYS, PRO_PLAN, TRIAL_ALLOWANCE, TRIAL_BRANDS } from '../plans'
import { paidRow, trialRow } from './fixtures'

const NOW = new Date('2026-09-13T12:00:00Z')

function daysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 86_400_000).toISOString()
}

const row = (overrides: Partial<AgencyBillingColumns> = {}) => trialRow(NOW, overrides)
const paid = (overrides: Partial<AgencyBillingColumns> = {}) =>
  paidRow(NOW, { subscription_quantity: 5, ...overrides })

describe('entitlementFor — the trial', () => {
  it('a live trial in agency mode may spend, publish and create up to three brands', () => {
    const e = entitlementFor(row(), NOW)
    expect(e.state).toBe('trial')
    expect([e.canSpend, e.canPublish, e.canCreate]).toEqual([true, true, true])
    expect(e.brands).toBe(TRIAL_BRANDS.agency)
    expect(e.limits).toEqual(TRIAL_ALLOWANCE)
    expect(e.periodKey).toBe('trial')
    expect(e.trialEndsAt?.toISOString()).toBe(daysFromNow(7))
    expect(e.resetsOn).toBeNull()
    expect(e.graceEndsAt).toBeNull()
    expect(e.endsOn).toBeNull()
    expect(e.timezone).toBe('Europe/Sofia')
  })

  it('a solo trial is one brand, on the same workspace-wide trial allowance as an agency', () => {
    const e = entitlementFor(row({ mode: 'solo' }), NOW)
    expect(e.mode).toBe('solo')
    expect(e.brands).toBe(1)
    expect(e.limits).toEqual(TRIAL_ALLOWANCE)
  })

  it('an ended trial inside the grace publishes but spends nothing, until the grace ends', () => {
    const e = entitlementFor(row({ trial_ends_at: daysFromNow(-2) }), NOW)
    expect(e.state).toBe('trial_grace')
    expect([e.canSpend, e.canPublish, e.canCreate]).toEqual([false, true, false])
    expect(e.limits).toEqual({ draft: 0, image: 0, rewrite: 0 })
    expect(e.graceEndsAt?.toISOString()).toBe(daysFromNow(GRACE_DAYS - 2))
  })

  it('an ended trial past the grace is locked, and remembers when the grace ran out', () => {
    const e = entitlementFor(row({ trial_ends_at: daysFromNow(-(GRACE_DAYS + 1)) }), NOW)
    expect(e.state).toBe('locked')
    expect([e.canSpend, e.canPublish, e.canCreate]).toEqual([false, false, false])
    expect(e.graceEndsAt?.toISOString()).toBe(daysFromNow(-1))
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
  it('an active plan scales the allowance by the paid quantity and buckets by period start', () => {
    const e = entitlementFor(paid(), NOW)
    expect(e.state).toBe('active')
    expect(e.plan).toBe('pro')
    expect(e.brands).toBe(5)
    expect(e.brandsUnlimited).toBe(true)
    expect(e.limits.draft).toBe(PRO_PLAN.perBrand.draft * 5)
    expect(e.periodKey).toBe('2026-09-01')
    expect(e.resetsOn?.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(e.endsOn).toBeNull()
  })

  it('a quantity below one, or none recorded, counts as one brand', () => {
    expect(entitlementFor(paid({ subscription_quantity: 0 }), NOW).brands).toBe(1)
    expect(entitlementFor(paid({ subscription_quantity: null }), NOW).brands).toBe(1)
  })

  it('the paid quantity is the brand count, with no ceiling', () => {
    const e = entitlementFor(paid({ subscription_quantity: 4 }), NOW)
    expect(e.brands).toBe(4)
    expect(e.brandsUnlimited).toBe(true)
    expect(e.limits.image).toBe(PRO_PLAN.perBrand.image * 4)
  })

  it('a failed renewal keeps full access for the grace, counted from past_due_since', () => {
    const inside = entitlementFor(
      paid({ subscription_status: 'past_due', past_due_since: daysFromNow(-3) }),
      NOW
    )
    expect(inside.state).toBe('past_due')
    expect(inside.canSpend).toBe(true)
    expect(inside.graceEndsAt?.toISOString()).toBe(daysFromNow(GRACE_DAYS - 3))
    expect(inside.periodKey).toBe('2026-09-01')
    const beyond = entitlementFor(
      paid({ subscription_status: 'past_due', past_due_since: daysFromNow(-(GRACE_DAYS + 1)) }),
      NOW
    )
    expect(beyond.state).toBe('locked')
  })

  it('past_due with no recorded start locks rather than granting an endless grace', () => {
    expect(entitlementFor(paid({ subscription_status: 'past_due' }), NOW).state).toBe('locked')
  })

  it('a paid row with no period start is locked rather than let into the trial bucket', () => {
    const e = entitlementFor(paid({ current_period_start: null }), NOW)
    expect(e.state).toBe('locked')
    expect(e.limits.draft).toBe(0)
  })

  it.each(['canceled', 'unpaid', 'paused', 'incomplete', 'incomplete_expired'])(
    'a %s subscription is locked',
    (status) => {
      expect(entitlementFor(paid({ subscription_status: status }), NOW).state).toBe('locked')
    }
  )

  it('cancel at period end stays active until Stripe ends the subscription, and says when', () => {
    const e = entitlementFor(paid({ cancel_at_period_end: true }), NOW)
    expect(e.state).toBe('active')
    expect(e.endsOn?.toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it("a 'house' workspace is always active, uncapped and unmetered, with no Stripe row", () => {
    const e = entitlementFor(row({ plan: 'house', trial_ends_at: daysFromNow(-90) }), NOW)
    expect(e.state).toBe('active')
    expect([e.canSpend, e.canPublish, e.canCreate]).toEqual([true, true, true])
    expect(e.brandsUnlimited).toBe(true)
    expect(e.limits.draft).toBeGreaterThan(1_000_000)
    expect(e.periodKey).toBe('2026-09')
    expect(e.resetsOn).toBeNull()
  })
})

describe('entitlementFor — canDelete', () => {
  it('a workspace with no subscription may be deleted, on the trial and after it', () => {
    expect(entitlementFor(row(), NOW).canDelete).toBe(true)
    expect(entitlementFor(row({ trial_ends_at: daysFromNow(-30) }), NOW).canDelete).toBe(true)
    expect(noEntitlement().canDelete).toBe(false)
  })

  it('a house workspace may be deleted like any other', () => {
    expect(entitlementFor(row({ plan: 'house' }), NOW).canDelete).toBe(true)
  })

  it('an open subscription blocks deletion until it is set to end — including one still trialing', () => {
    expect(entitlementFor(paid(), NOW).canDelete).toBe(false)
    expect(entitlementFor(paid({ subscription_status: 'past_due' }), NOW).canDelete).toBe(false)
    expect(entitlementFor(paid({ subscription_status: 'unpaid' }), NOW).canDelete).toBe(false)
    const trialing = paid({ subscription_status: 'trialing', trial_ends_at: daysFromNow(7) })
    expect(entitlementFor(trialing, NOW).state).toBe('trial')
    expect(entitlementFor(trialing, NOW).canDelete).toBe(false)
  })

  it('a subscription set to end, or already ended, no longer blocks it', () => {
    expect(entitlementFor(paid({ cancel_at_period_end: true }), NOW).canDelete).toBe(true)
    expect(entitlementFor(paid({ subscription_status: 'canceled' }), NOW).canDelete).toBe(true)
    expect(entitlementFor(paid({ subscription_status: 'incomplete_expired' }), NOW).canDelete).toBe(
      true
    )
  })
})

describe('entitlementFor — the subscription behind the state', () => {
  it('an active plan has an open subscription and no failed payment', () => {
    const e = entitlementFor(paid(), NOW)
    expect([e.subscriptionOpen, e.paymentFailed]).toEqual([true, false])
  })

  it('a failed renewal is a failed payment inside the grace and after it, when the state says locked', () => {
    const inside = entitlementFor(
      paid({ subscription_status: 'past_due', past_due_since: daysFromNow(-3) }),
      NOW
    )
    expect([inside.state, inside.subscriptionOpen, inside.paymentFailed]).toEqual([
      'past_due',
      true,
      true,
    ])
    const after = entitlementFor(
      paid({ subscription_status: 'past_due', past_due_since: daysFromNow(-9) }),
      NOW
    )
    expect([after.state, after.subscriptionOpen, after.paymentFailed]).toEqual([
      'locked',
      true,
      true,
    ])
    const unpaid = entitlementFor(paid({ subscription_status: 'unpaid' }), NOW)
    expect([unpaid.state, unpaid.paymentFailed]).toEqual(['locked', true])
  })

  it.each(['canceled', 'incomplete_expired'])('a %s subscription is not open', (status) => {
    const e = entitlementFor(paid({ subscription_status: status }), NOW)
    expect([e.subscriptionOpen, e.paymentFailed]).toEqual([false, false])
  })

  it('no subscription is nothing open, on the trial and in the empty entitlement', () => {
    expect(entitlementFor(row(), NOW).subscriptionOpen).toBe(false)
    expect(noEntitlement().subscriptionOpen).toBe(false)
    expect(noEntitlement().paymentFailed).toBe(false)
  })

  it('a failed renewal inside its grace names no reset date, since the period moves only once it is paid', () => {
    const e = entitlementFor(
      paid({ subscription_status: 'past_due', past_due_since: daysFromNow(-3) }),
      NOW
    )
    expect(e.resetsOn).toBeNull()
  })
})

describe('entitlementFor — the plan is derived', () => {
  it('is pro once a subscription is on the row, and trial before, whatever the column says', () => {
    expect(entitlementFor(paid({ plan: 'trial' }), NOW).plan).toBe('pro')
    expect(entitlementFor(paid({ plan: 'trial' }), NOW).state).toBe('active')
    expect(entitlementFor(row({ plan: 'pro' }), NOW).plan).toBe('trial')
  })

  it('is house only when the row is set to house by hand', () => {
    expect(entitlementFor(paid({ plan: 'house' }), NOW).plan).toBe('house')
  })

  it('house with an open subscription blocks deletion until it is set to end, and never names an end', () => {
    const open = entitlementFor(paid({ plan: 'house' }), NOW)
    expect([open.state, open.canDelete, open.planEnding]).toEqual(['active', false, false])
    const ending = entitlementFor(paid({ plan: 'house', cancel_at_period_end: true }), NOW)
    expect([ending.canDelete, ending.planEnding, ending.endsOn]).toEqual([true, true, null])
  })
})

describe('entitlementFor — a plan set to end', () => {
  it('is ending at its period end, and may then be deleted', () => {
    const e = entitlementFor(paid({ cancel_at_period_end: true }), NOW)
    expect([e.planEnding, e.canDelete]).toEqual([true, true])
    expect(e.endsOn?.toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it('is not ending while a failed renewal is still being collected, so it can be cancelled but not yet deleted', () => {
    for (const since of [daysFromNow(-3), daysFromNow(-9)]) {
      const e = entitlementFor(
        paid({
          subscription_status: 'past_due',
          past_due_since: since,
          cancel_at_period_end: true,
        }),
        NOW
      )
      expect([e.paymentFailed, e.planEnding, e.canDelete, e.endsOn]).toEqual([
        true,
        false,
        false,
        null,
      ])
    }
  })
})

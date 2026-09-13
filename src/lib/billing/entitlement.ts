import type { AgencyBillingColumns } from '@/lib/queries/select-columns'
import { MS_PER_DAY } from '@/utils/constants'
import {
  GRACE_DAYS,
  PLANS,
  TRIAL_BRANDS,
  TRIAL_PER_BRAND,
  type Allowance,
  type AllowanceKind,
  type PlanId,
} from './plans'

/**
 * What a workspace may do right now, derived from its agencies row and the clock — the ONLY
 * interpretation of `plan`, `subscription_status`, `trial_ends_at` and the Stripe period columns.
 *
 * Nothing stores this state twice and no cron flips a status column: a webhook writes the row,
 * a cron or a request reads it here. The states:
 *   trial        no Stripe subscription and the trial has not ended — or a Stripe subscription
 *                still 'trialing' (an early converter with a deferred first charge), which keeps
 *                trial limits until the first paid invoice makes it 'active';
 *   trial_grace  the trial ended less than GRACE_DAYS ago: nothing spends, scheduled posts still
 *                publish and syncs continue;
 *   active       a paid subscription;
 *   past_due     a renewal failed less than GRACE_DAYS ago — full access, so a card hiccup does
 *                not stop a paying agency's autopilot; the grace counts from `past_due_since`,
 *                not from `current_period_end`, which Stripe advances on the renewal invoice;
 *   locked       everything else: read-only.
 *
 * `periodKey` is the usage bucket: 'trial' before any paid period, else the ISO date the Stripe
 * period started, so a customer who subscribes on the 20th does not get two allowances for one
 * payment. `limits` are all zero whenever the workspace cannot spend, so a roster that slips past
 * a gate still cannot consume anything.
 */
export type EntitlementState = 'trial' | 'trial_grace' | 'active' | 'past_due' | 'locked'

export interface Entitlement {
  state: EntitlementState
  plan: PlanId
  mode: 'agency' | 'solo'
  canSpend: boolean
  canPublish: boolean
  canCreate: boolean
  /** Brands the workspace may hold: the trial cap, 1 on starter, the paid quantity on agency. */
  brands: number
  /** Whether more brands may be created at all — the paid plan has no ceiling, only a price. */
  brandsUnlimited: boolean
  limits: Allowance
  periodKey: string
  trialEndsAt: Date | null
  /** When the current allowance resets: the period end, or the trial end. */
  resetsOn: Date | null
}

function isPlanId(value: string): value is PlanId {
  return value === 'trial' || value === 'starter' || value === 'agency'
}

function zeroAllowance(): Allowance {
  return { draft: 0, image: 0, rewrite: 0 }
}

function scaled(perBrand: Allowance, brands: number): Allowance {
  const out = zeroAllowance()
  for (const kind of Object.keys(perBrand) as AllowanceKind[]) out[kind] = perBrand[kind] * brands
  return out
}

function dateOf(value: string | null): Date | null {
  return value ? new Date(value) : null
}

function trialLimits(mode: 'agency' | 'solo'): { brands: number; limits: Allowance } {
  const brands = TRIAL_BRANDS[mode]
  return { brands, limits: scaled(TRIAL_PER_BRAND, brands) }
}

/** A workspace with no row to derive from — locked, nothing allowed. */
export function noEntitlement(): Entitlement {
  return {
    state: 'locked',
    plan: 'trial',
    mode: 'agency',
    canSpend: false,
    canPublish: false,
    canCreate: false,
    brands: 0,
    brandsUnlimited: false,
    limits: zeroAllowance(),
    periodKey: 'trial',
    trialEndsAt: null,
    resetsOn: null,
  }
}

/** The entitlement for one agencies row at instant `now`. Pure. */
export function entitlementFor(row: AgencyBillingColumns, now: Date): Entitlement {
  const mode: 'agency' | 'solo' = row.mode === 'solo' ? 'solo' : 'agency'
  const plan: PlanId = isPlanId(row.plan) ? row.plan : 'trial'
  const trialEndsAt = dateOf(row.trial_ends_at)
  const graceMs = GRACE_DAYS * MS_PER_DAY

  const locked = (state: EntitlementState, resetsOn: Date | null): Entitlement => ({
    state,
    plan,
    mode,
    canSpend: false,
    canPublish: state === 'trial_grace',
    canCreate: false,
    brands: 0,
    brandsUnlimited: false,
    limits: zeroAllowance(),
    periodKey: 'trial',
    trialEndsAt,
    resetsOn,
  })

  const onTrial = (): Entitlement => {
    const { brands, limits } = trialLimits(mode)
    return {
      state: 'trial',
      plan,
      mode,
      canSpend: true,
      canPublish: true,
      canCreate: true,
      brands,
      brandsUnlimited: false,
      limits,
      periodKey: 'trial',
      trialEndsAt,
      resetsOn: trialEndsAt,
    }
  }

  const status = row.subscription_status
  if (!row.stripe_subscription_id || status === 'trialing') {
    if (trialEndsAt && now < trialEndsAt) return onTrial()
    if (trialEndsAt && now.getTime() < trialEndsAt.getTime() + graceMs)
      return locked('trial_grace', trialEndsAt)
    return locked('locked', null)
  }

  const pastDueSince = dateOf(row.past_due_since)
  const state: EntitlementState =
    status === 'active'
      ? 'active'
      : status === 'past_due' && pastDueSince && now.getTime() < pastDueSince.getTime() + graceMs
        ? 'past_due'
        : 'locked'
  if (state === 'locked') return locked('locked', null)

  const paid = plan === 'trial' ? null : PLANS[plan]
  if (!paid) return locked('locked', null)
  const quantity = Math.max(paid.minimumBrands, row.subscription_quantity ?? paid.minimumBrands)
  const brands = Math.min(quantity, paid.maxBrands)

  return {
    state,
    plan,
    mode,
    canSpend: true,
    canPublish: true,
    canCreate: true,
    brands,
    brandsUnlimited: paid.maxBrands === Infinity,
    limits: scaled(paid.perBrand, brands),
    periodKey: row.current_period_start?.slice(0, 10) ?? 'trial',
    trialEndsAt,
    resetsOn: dateOf(row.current_period_end),
  }
}

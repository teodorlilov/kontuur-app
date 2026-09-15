import type { AgencyBillingColumns } from '@/lib/queries/select-columns'
import { MS_PER_DAY } from '@/utils/constants'
import {
  GRACE_DAYS,
  PLANS,
  TRIAL_BRANDS,
  TRIAL_PER_BRAND,
  UNMETERED,
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
 *                publish and syncs continue until `graceEndsAt`;
 *   active       a paid subscription;
 *   past_due     a renewal failed less than GRACE_DAYS ago — full access until `graceEndsAt`, so a
 *                card hiccup does not stop a paying agency's autopilot; the grace counts from
 *                `past_due_since`, never from the period columns;
 *   locked       everything else: read-only.
 * A 'house' workspace (plans.ts) is always `active` with an unmetered allowance and no cap.
 *
 * `periodKey` is the usage bucket: 'trial' for the trial's one allowance; the ISO date the Stripe
 * period started for a paid plan, so a customer who subscribes on the 20th does not get two
 * allowances for one payment — and a paid row with no period start is locked rather than let
 * into the trial's bucket; the UTC calendar month ('YYYY-MM') for a house workspace, whose usage
 * is counted and never refused. The period columns must advance only on a paid invoice
 * (docs/plans/BILLING.md step 9): a failed renewal that moved them would hand the grace days a
 * fresh allowance. `limits` are all zero whenever the workspace cannot spend, so a roster that
 * slips past a gate still cannot consume anything.
 *
 * Every date on the entitlement is read in `timezone`, the agency's own — the row carries it so
 * a sentence built anywhere (a 402, a bell, the shell) names the day the customer will see.
 */
export type EntitlementState = 'trial' | 'trial_grace' | 'active' | 'past_due' | 'locked'

/** What a site is about to do: spend money, publish to a network, or create a brand. */
export type EntitlementNeed = 'spend' | 'publish' | 'create'

export interface Entitlement {
  state: EntitlementState
  plan: PlanId
  mode: 'agency' | 'solo'
  /** The agency's IANA zone — the one every date below is written out in. */
  timezone: string
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
  /** When the paid allowance resets — the period end. Null on the trial, whose one allowance never resets, and on house. */
  resetsOn: Date | null
  /**
   * When a grace runs out, or ran out: publishing stops (trial_grace), the workspace pauses
   * (past_due), or the day a trial's grace ended (locked). Null for a paid subscription that ended.
   */
  graceEndsAt: Date | null
}

/** Whether the entitlement allows what a site is about to do. */
export function allows(entitlement: Entitlement, need: EntitlementNeed): boolean {
  return need === 'spend'
    ? entitlement.canSpend
    : need === 'publish'
      ? entitlement.canPublish
      : entitlement.canCreate
}

function isPlanId(value: string): value is PlanId {
  return value === 'trial' || value === 'starter' || value === 'agency' || value === 'house'
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

function plusGrace(from: Date): Date {
  return new Date(from.getTime() + GRACE_DAYS * MS_PER_DAY)
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
    timezone: 'UTC',
    canSpend: false,
    canPublish: false,
    canCreate: false,
    brands: 0,
    brandsUnlimited: false,
    limits: zeroAllowance(),
    periodKey: 'trial',
    trialEndsAt: null,
    resetsOn: null,
    graceEndsAt: null,
  }
}

/** The entitlement for one agencies row at instant `now`. Pure. */
export function entitlementFor(row: AgencyBillingColumns, now: Date): Entitlement {
  const mode: 'agency' | 'solo' = row.mode === 'solo' ? 'solo' : 'agency'
  const plan: PlanId = isPlanId(row.plan) ? row.plan : 'trial'
  const timezone = row.timezone
  const trialEndsAt = dateOf(row.trial_ends_at)

  const locked = (state: EntitlementState, graceEndsAt: Date | null): Entitlement => ({
    state,
    plan,
    mode,
    timezone,
    canSpend: false,
    canPublish: state === 'trial_grace',
    canCreate: false,
    brands: 0,
    brandsUnlimited: false,
    limits: zeroAllowance(),
    periodKey: 'trial',
    trialEndsAt,
    resetsOn: null,
    graceEndsAt,
  })

  const onTrial = (): Entitlement => {
    const { brands, limits } = trialLimits(mode)
    return {
      state: 'trial',
      plan,
      mode,
      timezone,
      canSpend: true,
      canPublish: true,
      canCreate: true,
      brands,
      brandsUnlimited: false,
      limits,
      periodKey: 'trial',
      trialEndsAt,
      resetsOn: null,
      graceEndsAt: null,
    }
  }

  if (plan === 'house') {
    return {
      state: 'active',
      plan,
      mode,
      timezone,
      canSpend: true,
      canPublish: true,
      canCreate: true,
      brands: Infinity,
      brandsUnlimited: true,
      limits: { draft: UNMETERED, image: UNMETERED, rewrite: UNMETERED },
      periodKey: now.toISOString().slice(0, 7),
      trialEndsAt: null,
      resetsOn: null,
      graceEndsAt: null,
    }
  }

  const status = row.subscription_status
  if (!row.stripe_subscription_id || status === 'trialing') {
    if (trialEndsAt && now < trialEndsAt) return onTrial()
    if (trialEndsAt && now < plusGrace(trialEndsAt))
      return locked('trial_grace', plusGrace(trialEndsAt))
    return locked('locked', trialEndsAt ? plusGrace(trialEndsAt) : null)
  }

  const pastDueSince = dateOf(row.past_due_since)
  const state: EntitlementState =
    status === 'active'
      ? 'active'
      : status === 'past_due' && pastDueSince && now < plusGrace(pastDueSince)
        ? 'past_due'
        : 'locked'
  if (state === 'locked') return locked('locked', null)

  const paid = plan === 'trial' ? null : PLANS[plan]
  const periodStart = row.current_period_start?.slice(0, 10)
  if (!paid || !periodStart) return locked('locked', null)
  const quantity = Math.max(paid.minimumBrands, row.subscription_quantity ?? paid.minimumBrands)
  const brands = Math.min(quantity, paid.maxBrands)

  return {
    state,
    plan,
    mode,
    timezone,
    canSpend: true,
    canPublish: true,
    canCreate: true,
    brands,
    brandsUnlimited: paid.maxBrands === Infinity,
    limits: scaled(paid.perBrand, brands),
    periodKey: periodStart,
    trialEndsAt,
    resetsOn: dateOf(row.current_period_end),
    graceEndsAt: state === 'past_due' && pastDueSince ? plusGrace(pastDueSince) : null,
  }
}

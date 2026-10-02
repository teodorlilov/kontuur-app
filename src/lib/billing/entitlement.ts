import type { AgencyBillingColumns } from '@/lib/queries/select-columns'
import { MS_PER_DAY } from '@/utils/constants'
import {
  GRACE_DAYS,
  PRO_PLAN,
  TRIAL_ALLOWANCE,
  TRIAL_BRANDS,
  UNMETERED,
  type Allowance,
  type PlanId,
} from './plans'

/**
 * What a workspace may do right now, derived from its agencies row and the clock — the ONLY
 * interpretation of `plan`, `subscription_status`, `trial_ends_at` and the Stripe period columns;
 * nothing stores it and no cron flips a status column. The states:
 *   trial        no subscription, or one still 'trialing', and `trial_ends_at` not yet passed;
 *   trial_grace  the trial ended under GRACE_DAYS ago: nothing spends, scheduled posts publish;
 *   active       a paid subscription, and always a 'house' workspace (plans.ts), unmetered;
 *   past_due     a renewal failed under GRACE_DAYS ago, counted from `past_due_since` and never
 *                from the period columns: full access until `graceEndsAt`;
 *   locked       everything else: read-only.
 */
export type EntitlementState = 'trial' | 'trial_grace' | 'active' | 'past_due' | 'locked'

/**
 * What a site is about to do: spend money — which creating a brand is too, since a new brand's
 * setup reads its site and every later run spends on it — or publish to a network.
 */
export type EntitlementNeed = 'spend' | 'publish'

export interface Entitlement {
  state: EntitlementState
  plan: PlanId
  mode: 'agency' | 'solo'
  /** The agency's IANA zone — the one every date below is written out in. */
  timezone: string
  canSpend: boolean
  canPublish: boolean
  /**
   * Brands the workspace may hold: the trial's cap, the paid plan's client slots (Stripe's
   * quantity, `agencies.client_slots`, docs/plans/CLIENT-SLOTS.md — the paid count on a row no
   * snapshot has written since migration 20260865), Infinity on house, 0 when it cannot spend.
   * Ask `brandCap` for "is there a cap".
   */
  brands: number
  /**
   * Client slots paid for in the current period (`agencies.subscription_quantity`) — the paid
   * allowance's multiplier, and what a raise may restore uncharged. Higher than `brands` after a
   * lower, until the renewal is paid; 0 off the paid plan.
   */
  brandsPaid: number
  /** All zero whenever the workspace cannot spend: whatever slips past a gate consumes nothing. */
  limits: Allowance
  /**
   * The usage bucket: 'trial' for the trial's one allowance and on every entitlement that cannot
   * spend (its `limits` are zero); for a paid plan the date its Stripe period started (set by a new
   * subscription's first fill and moved by a paid invoice, `applySubscriptionSnapshot`), so
   * subscribing on the 20th buys one allowance, not two, and a paid row with no period start is
   * locked; the UTC month ('YYYY-MM') on house.
   */
  periodKey: string
  trialEndsAt: Date | null
  /**
   * When the paid allowance resets — the period end. Null on the trial, whose one allowance never
   * resets; on house; and while a renewal has failed, since the period moves only once it is paid.
   */
  resetsOn: Date | null
  /**
   * When a grace runs out, or ran out: publishing stops (trial_grace), the workspace pauses
   * (past_due), or the day a trial's grace ended (locked). Null for a paid subscription that ended.
   */
  graceEndsAt: Date | null
  /** The day a paid plan set to end ends — the period end while `planEnding`; null otherwise, and on house, whose workspace never ends. */
  endsOn: Date | null
  /**
   * Whether the workspace may be deleted now — false while a subscription is open and not set to
   * end (`planEnding`), so a workspace whose data is gone can never renew.
   */
  canDelete: boolean
  /**
   * Whether a Stripe subscription is open: on the row and not ended (`hasSubscriptionEnded`) —
   * whatever the state, since a 'trialing' one still bills and a failed one stays open once locked.
   */
  subscriptionOpen: boolean
  /**
   * Whether that open subscription's renewal failed (`past_due` or `unpaid`) — inside the grace and
   * after it, when the workspace is locked. Every "the renewal failed" decision reads this, never
   * the state, which says `locked` once the grace is over.
   */
  paymentFailed: boolean
  /**
   * Whether the open subscription is set to end at its period end — a cancel already made. Never
   * while its renewal has failed: such a plan counts as running until `setPlanEnding` cancels it
   * at once.
   */
  planEnding: boolean
}

/**
 * Whether the workspace is on the paid plan and Stripe is billing it — active, or inside the
 * grace after a failed renewal. Asked by the Checkout return card (whether the plan it waits for
 * is live); what the plan panel offers is decided by `subscriptionOpen` instead, which a locked
 * workspace can still have.
 */
export function isPaying(entitlement: Pick<Entitlement, 'plan' | 'state'>): boolean {
  return (
    entitlement.plan === 'pro' &&
    (entitlement.state === 'active' || entitlement.state === 'past_due')
  )
}

/** Whether the entitlement allows what a site is about to do. */
export function allows(entitlement: Entitlement, need: EntitlementNeed): boolean {
  return need === 'spend' ? entitlement.canSpend : entitlement.canPublish
}

/**
 * The most brands the workspace may hold, or null when there is no cap (house). One answer for
 * `createClient` and its race re-check, every Add-client control (`addBrandRefusal`) and the plan
 * panel's Clients meter.
 */
export function brandCap(entitlement: Pick<Entitlement, 'brands'>): number | null {
  return Number.isFinite(entitlement.brands) ? entitlement.brands : null
}

/**
 * Whether a subscription status is final — Stripe ends a subscription as `canceled`, or as
 * `incomplete_expired` when its first payment never went through. Every other status can still
 * bill. The one reading of "ended" for the entitlement, the Stripe snapshot
 * (src/lib/billing/subscription-store.ts) and Checkout (`createCheckoutSession`,
 * src/lib/billing/checkout.ts).
 */
export function hasSubscriptionEnded(status: string | null): boolean {
  return status === 'canceled' || status === 'incomplete_expired'
}

/**
 * Whether a subscription status means its renewal failed and is still owed — `past_due` while
 * Stripe retries the card, `unpaid` once it has stopped. The one reading for the entitlement and
 * for ending a plan (`setPlanEnding`, src/lib/billing/subscription-store.ts).
 */
export function hasPaymentFailed(status: string | null): boolean {
  return status === 'past_due' || status === 'unpaid'
}

/** 'house' only when set by hand; otherwise the subscription id decides, not the `plan` column. */
function planOf(row: AgencyBillingColumns): PlanId {
  if (row.plan === 'house') return 'house'
  return row.stripe_subscription_id ? 'pro' : 'trial'
}

function zeroAllowance(): Allowance {
  return { draft: 0, image: 0, rewrite: 0 }
}

/** The paid pool: each kind's per-brand allowance times the brands paid for. */
function scaled(perBrand: Allowance, brands: number): Allowance {
  return {
    draft: perBrand.draft * brands,
    image: perBrand.image * brands,
    rewrite: perBrand.rewrite * brands,
  }
}

function dateOf(value: string | null): Date | null {
  return value ? new Date(value) : null
}

function plusGrace(from: Date): Date {
  return new Date(from.getTime() + GRACE_DAYS * MS_PER_DAY)
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
    brands: 0,
    brandsPaid: 0,
    limits: zeroAllowance(),
    periodKey: 'trial',
    trialEndsAt: null,
    resetsOn: null,
    graceEndsAt: null,
    endsOn: null,
    canDelete: false,
    subscriptionOpen: false,
    paymentFailed: false,
    planEnding: false,
  }
}

/** The entitlement for one agencies row at instant `now`. Pure. */
export function entitlementFor(row: AgencyBillingColumns, now: Date): Entitlement {
  const mode: 'agency' | 'solo' = row.mode === 'solo' ? 'solo' : 'agency'
  const plan = planOf(row)
  const timezone = row.timezone
  const trialEndsAt = dateOf(row.trial_ends_at)
  const status = row.subscription_status
  const subscriptionOpen = row.stripe_subscription_id !== null && !hasSubscriptionEnded(status)
  const paymentFailed = subscriptionOpen && hasPaymentFailed(status)
  const planEnding = subscriptionOpen && row.cancel_at_period_end && !paymentFailed
  const standing = {
    subscriptionOpen,
    paymentFailed,
    planEnding,
    canDelete: !subscriptionOpen || planEnding,
  }

  const locked = (state: EntitlementState, graceEndsAt: Date | null): Entitlement => ({
    state,
    plan,
    mode,
    timezone,
    canSpend: false,
    canPublish: state === 'trial_grace',
    brands: 0,
    brandsPaid: 0,
    limits: zeroAllowance(),
    periodKey: 'trial',
    trialEndsAt,
    resetsOn: null,
    graceEndsAt,
    endsOn: null,
    ...standing,
  })

  const onTrial = (): Entitlement => ({
    state: 'trial',
    plan,
    mode,
    timezone,
    canSpend: true,
    canPublish: true,
    brands: TRIAL_BRANDS[mode],
    brandsPaid: 0,
    limits: TRIAL_ALLOWANCE,
    periodKey: 'trial',
    trialEndsAt,
    resetsOn: null,
    graceEndsAt: null,
    endsOn: null,
    ...standing,
  })

  if (plan === 'house') {
    return {
      state: 'active',
      plan,
      mode,
      timezone,
      canSpend: true,
      canPublish: true,
      brands: Infinity,
      brandsPaid: 0,
      limits: { draft: UNMETERED, image: UNMETERED, rewrite: UNMETERED },
      periodKey: now.toISOString().slice(0, 7),
      trialEndsAt: null,
      resetsOn: null,
      graceEndsAt: null,
      endsOn: null,
      ...standing,
    }
  }

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

  const periodStart = row.current_period_start?.slice(0, 10)
  if (!periodStart) return locked('locked', null)
  const brandsPaid = Math.max(1, row.subscription_quantity ?? 1)
  const periodEnd = dateOf(row.current_period_end)

  return {
    state,
    plan,
    mode,
    timezone,
    canSpend: true,
    canPublish: true,
    brands: row.client_slots ?? brandsPaid,
    brandsPaid,
    limits: scaled(PRO_PLAN.perBrand, brandsPaid),
    periodKey: periodStart,
    trialEndsAt,
    resetsOn: state === 'past_due' ? null : periodEnd,
    graceEndsAt: state === 'past_due' && pastDueSince ? plusGrace(pastDueSince) : null,
    endsOn: planEnding ? periodEnd : null,
    ...standing,
  }
}

/**
 * The plan table — every number a plan is made of, in one place.
 *
 * Prices are placeholders the founder chose to launch with and change later (docs/plans/BILLING.md,
 * "Placeholders"); nothing else in the app may restate one. Amounts are euro cents, net of VAT.
 *
 * An allowance is per brand per period and pooled across the workspace: the limit a workspace
 * sees is `perBrand × brands`, where `brands` is the paid quantity on `agency` (never below
 * `minimumBrands`), 1 on `starter`, and the trial cap on `trial`. The trial numbers are for the
 * WHOLE fourteen days, not per month — the trial has one period, 'trial'.
 *
 * 'agency' sets `maxBrands` to `Infinity`: the count is what the customer pays for. 'house' is the
 * company's own and partner workspaces: no Stripe row, no cap, no allowance, never locks — set by
 * hand in the database, never from the app. Its usage is still counted, against a ceiling the
 * counter cannot reach, so the telemetry and the meters stay honest.
 */

export type PlanId = 'trial' | 'starter' | 'agency' | 'house'

/** A quota the compare-and-set cannot reach — the old image counter's "no ceiling" figure. */
export const UNMETERED = 2_000_000_000

export type AllowanceKind = 'draft' | 'image' | 'rewrite'

export type Allowance = Record<AllowanceKind, number>

interface PaidPlan {
  /** Euro cents per brand per month, net of VAT. */
  priceCents: number
  /** The quantity Stripe bills even when fewer brands exist — the €57 floor on 'agency'. */
  minimumBrands: number
  maxBrands: number
  perBrand: Allowance
}

export const PLANS: Record<Exclude<PlanId, 'trial' | 'house'>, PaidPlan> = {
  starter: {
    priceCents: 2900,
    minimumBrands: 1,
    maxBrands: 1,
    perBrand: { draft: 40, image: 120, rewrite: 30 },
  },
  agency: {
    priceCents: 1900,
    minimumBrands: 3,
    maxBrands: Infinity,
    perBrand: { draft: 40, image: 120, rewrite: 30 },
  },
}

/** Brands a trial workspace may create, by workspace mode. */
export const TRIAL_BRANDS = { agency: 3, solo: 1 } as const

/** Per brand, for the whole trial — pooled like a paid allowance. */
export const TRIAL_PER_BRAND: Allowance = { draft: 20, image: 50, rewrite: 15 }

/** Days after the trial ends, and after a failed renewal, before the workspace is paused. */
export const GRACE_DAYS = 7

/** Human label for a plan, for the settings header and the plan pill. */
export const PLAN_LABELS: Record<PlanId, string> = {
  trial: 'Trial',
  starter: 'Starter',
  agency: 'Agency',
  house: 'Internal',
}

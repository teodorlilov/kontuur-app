/**
 * The plan table — every number a plan is made of, in one place.
 *
 * Prices are placeholders the founder chose to launch with and change later (docs/plans/BILLING.md,
 * "Placeholders"); nothing else in the app may restate one. Amounts are euro cents, net of VAT.
 *
 * There is one paid plan, billed per brand: the limit a workspace sees is `perBrand × brands`,
 * where `brands` is the paid quantity on 'pro' and the trial cap on 'trial'. The trial numbers
 * are for the WHOLE fourteen days, not per month — the trial has one period, 'trial'.
 *
 * 'house' is the company's own and partner workspaces: no Stripe row, no cap, no allowance, never
 * locks — set by hand in the database, never from the app. Its usage is still counted, against a
 * ceiling the counter cannot reach, so the telemetry and the meters stay honest.
 */

export type PlanId = 'trial' | 'pro' | 'house'

/** A quota the compare-and-set cannot reach: usage is counted against it, never refused. */
export const UNMETERED = 2_000_000_000

/** A finite limit to show or budget against, or null when the workspace is unmetered. */
export function meteredLimit(limit: number): number | null {
  return limit >= UNMETERED ? null : limit
}

export type AllowanceKind = 'draft' | 'image' | 'rewrite'

export type Allowance = Record<AllowanceKind, number>

/** The one paid plan: euro cents per brand per month, net of VAT, and what each brand adds to the pool. */
export const PRO_PLAN: { priceCents: number; perBrand: Allowance } = {
  priceCents: 1900,
  perBrand: { draft: 40, image: 120, rewrite: 30 },
}

/** Brands a trial workspace may create, by workspace mode. */
export const TRIAL_BRANDS = { agency: 3, solo: 1 } as const

/** Per brand, for the whole trial — pooled like a paid allowance. */
export const TRIAL_PER_BRAND: Allowance = { draft: 20, image: 50, rewrite: 15 }

/** Days after the trial ends, and after a failed renewal, before the workspace is paused. */
export const GRACE_DAYS = 7

/** Share of an allowance at which the bell warns once and the settings meter turns Amber. */
export const ALLOWANCE_WARN_SHARE = 0.8

/** Human label for a plan, for the settings header and the plan pill. */
export const PLAN_LABELS: Record<PlanId, string> = {
  trial: 'Trial',
  pro: 'Pro',
  house: 'Internal',
}

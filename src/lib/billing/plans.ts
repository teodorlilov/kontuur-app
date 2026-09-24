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

/**
 * The one paid plan: euro cents per brand per month, net of VAT, and what each brand adds to the
 * pool.
 *
 * Both halves are priced off measured cost, 2026-09-24. One draft's text costs €0.077 (five Claude
 * calls and 2.5 Tavily searches) and one picture €0.050, and 75 real posts run 79 % carousels of
 * 4.62 slides — so a finished post costs about €0.29 and takes 4.2 pictures once re-rolls are
 * counted. The allowance is 25 posts, carried as the drafts and the pictures those posts need so
 * neither pool strands the other: 25 × 4.2 ≈ 105. Fully spent it costs us €7.34 against €28.32 net
 * of Stripe's fee. A client posting the default three times a week uses about half of it.
 */
export const PRO_PLAN: { priceCents: number; perBrand: Allowance } = {
  priceCents: 2900,
  perBrand: { draft: 25, image: 105, rewrite: 15 },
}

/** Brands a trial workspace may create, by workspace mode. */
export const TRIAL_BRANDS = { agency: 3, solo: 1 } as const

/**
 * The whole trial's allowance — twelve posts, for the WORKSPACE rather than per brand.
 *
 * It used to be scaled by the brand cap, so an agency trial received three brands of allowance
 * whether it created three clients or one: one two-client workspace spent all 60 drafts and all
 * 150 pictures, €12.14 of provider money, with no card on file. Twelve posts is enough to judge
 * the product and costs €3.43, and the brand cap above is unchanged — how many clients a trial may
 * hold is a different question from how much it may spend.
 */
export const TRIAL_ALLOWANCE: Allowance = { draft: 12, image: 50, rewrite: 5 }

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

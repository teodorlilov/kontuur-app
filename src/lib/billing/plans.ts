/**
 * The plan table — every number a plan is made of, in one place (docs/plans/BILLING.md); nothing
 * else in the app may restate one. Amounts are euro cents, net of VAT. The one paid plan is billed
 * per brand (`priceCents`) and its allowance is `perBrand × brands`; the trial's allowance is for the WHOLE trial and workspace,
 * never per month or per brand (`TRIAL_ALLOWANCE`).
 *
 * 'house' (the company's own and partner workspaces) is set by hand in the database, never from
 * the app or Stripe: no cap, never locks, usage still counted against `UNMETERED` so the meters
 * stay honest. One set to house while it still pays keeps its subscription until the plan panel
 * ends it.
 */

export type PlanId = 'trial' | 'pro' | 'house'

/** A quota the compare-and-set cannot reach: usage is counted against it, never refused. */
export const UNMETERED = 2_000_000_000

/** A finite limit to show or budget against, or null when the workspace is unmetered. */
export function meteredLimit(limit: number): number | null {
  return limit >= UNMETERED ? null : limit
}

/**
 * Every allowance pool, in the order the plan panel's meters list them — the one list of kinds;
 * `usage_counters.kind` holds these under its CHECK (migration 20260852).
 */
export const ALLOWANCE_KINDS = ['draft', 'image', 'rewrite'] as const

export type AllowanceKind = (typeof ALLOWANCE_KINDS)[number]

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

/**
 * How many brands Checkout bills for: the workspace's clients, never fewer than one — a workspace
 * starts paying for the brand it is set up for even before its first client exists.
 */
export function billableQuantity(clientCount: number): number {
  return Math.max(1, clientCount)
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

/**
 * How long a new workspace's trial runs. `createUserRecord` (src/lib/auth/create-user-record.ts)
 * stamps the end from it — the column has no default once migration 20260862 is applied after the
 * deploy — and the sign-up and landing sentences read it, so the promise and the stamp cannot
 * disagree.
 */
export const TRIAL_DAYS = 14

/** Days before the trial ends at which the shell, and the trial-ending reminder, start saying so. */
export const TRIAL_NOTICE_DAYS = 3

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

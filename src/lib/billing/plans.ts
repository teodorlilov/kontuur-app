/**
 * The plan table — every number a plan is made of, in one place (docs/plans/BILLING.md); nothing
 * else in the app may restate one. Amounts are euro cents, net of VAT. The one paid plan is billed
 * per client slot (`priceCents`, docs/plans/CLIENT-SLOTS.md) and its allowance is `perBrand` times
 * the slots paid for this period; the trial's allowance is for the WHOLE trial and workspace, never
 * per month or per brand (`TRIAL_ALLOWANCE`).
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
 * The fewest client slots a workspace may pay for: its clients, never fewer than one — a workspace
 * pays for the brand it is set up for even before its first client exists. The floor of Checkout's
 * number and of every lower (`startCheckout`, `setClientSlotsAction`,
 * src/features/settings/actions/billing-actions.ts).
 */
export function billableQuantity(clientCount: number): number {
  return Math.max(1, clientCount)
}

/**
 * The most client slots a workspace may buy — a guard against a typo reaching the card, checked on
 * a raise only, so a larger number set by hand in Stripe can always be lowered.
 */
export const MAX_CLIENT_SLOTS = 50

/**
 * Stripe's smallest charge in euro, €0.50 (Stripe's supported-currencies page, "Minimum charge
 * amount by currency"). It holds while the account's payouts settle in euro. A pro-rata amount under
 * it is left on the renewal invoice rather than invoiced on its own, since an invoice below it may
 * leave `amount_due` at 0 (node_modules/stripe/esm/resources/Invoices.d.ts).
 */
const STRIPE_MIN_CHARGE_CENTS = 50

/** What `slots` client slots cost a month, in euro cents net of VAT. */
export function monthlyCents(slots: number): number {
  return PRO_PLAN.priceCents * slots
}

/** What a change of client slots is, and how many of the new slots it charges for. */
interface SlotChange {
  kind: 'raise' | 'restore' | 'lower' | 'same'
  charged: number
}

/**
 * A change of the ordered slots from `from` to `to`, with `paid` slots already billed this period.
 * Subscriptions run in Stripe's flexible billing mode (`createCheckoutSession`,
 * src/lib/billing/checkout.ts), where a quantity update credits what was last billed and debits the
 * new quantity (docs.stripe.com/billing/subscriptions/billing-mode). So only the slots above both
 * `from` and `paid` are charged; going back up to `paid` is a free restore, and a lower is never
 * credited. One rule for the Stripe write (`setClientSlots`, src/lib/billing/client-slots.ts) and
 * for the confirm that describes it (`slotChangeConsequence`, src/lib/billing/copy.ts).
 */
export function slotChange(from: number, to: number, paid: number): SlotChange {
  if (to === from) return { kind: 'same', charged: 0 }
  if (to < from) return { kind: 'lower', charged: 0 }
  const charged = Math.max(0, to - Math.max(from, paid))
  return { kind: charged > 0 ? 'raise' : 'restore', charged }
}

/** The unrounded pro-rata amount for `units` slots over what is left of `period` at `now`. */
function proRataExact(units: number, period: { start: Date; end: Date }, now: Date): number {
  const length = period.end.getTime() - period.start.getTime()
  const left = Math.max(0, period.end.getTime() - now.getTime())
  return PRO_PLAN.priceCents * units * (length > 0 ? left / length : 0)
}

/**
 * The pro-rata cents for `units` more slots over what is left of `period` at `now`, net of VAT, at
 * `PRO_PLAN.priceCents` — the only price Checkout sells (`verifiedPriceId`,
 * src/lib/billing/stripe.ts). An estimate to the cent: Stripe's invoice carries the exact figure.
 */
export function proRataCents(units: number, period: { start: Date; end: Date }, now: Date): number {
  return Math.round(proRataExact(units, period, now))
}

/**
 * How far above Stripe's minimum a raise must be to be charged at once. In flexible mode Stripe
 * bills it as two separately rounded lines (a credit and a debit), so its total can land a cent
 * below the estimate; an invoice under the minimum would carry to the customer's balance, which
 * `refuseBalances` (src/lib/billing/documents.ts) will not document.
 */
const PRORATION_ROUNDING_CENTS = 2

/**
 * Whether `charged` slots raised at `now` are charged at once, or left on the renewal invoice
 * because the amount is under Stripe's minimum. One decision for the Stripe write
 * (`setClientSlots`, src/lib/billing/client-slots.ts) and the confirm that announces it
 * (`slotChangeConsequence`, src/lib/billing/copy.ts).
 */
export function chargesToday(
  charged: number,
  period: { start: Date; end: Date },
  now: Date
): boolean {
  return proRataExact(charged, period, now) >= STRIPE_MIN_CHARGE_CENTS + PRORATION_ROUNDING_CENTS
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

import 'server-only'

import { unstable_cache } from 'next/cache'
import Stripe from 'stripe'
import { PRO_PLAN } from './plans'

let client: Stripe | null = null

/**
 * The one Stripe client. Built lazily on `STRIPE_SECRET_KEY` and kept for the process, on the
 * API version the installed SDK pins (stripe@22 → 2026-08-26.dahlia); the Dashboard webhook
 * endpoint is set to the same version (docs/plans/BILLING.md step 12), so an event's payload and
 * this code describe the same shapes. Nothing outside `src/lib/billing/` and the webhook route
 * touches the SDK. An unset key throws here, at the first use, not deep inside a request.
 */
export function stripeClient(): Stripe {
  if (client) return client
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  client = new Stripe(key)
  return client
}

/**
 * The one price a workspace can buy, per client per month, created by hand in the Dashboard for
 * each mode and named here by its id, so test and live differ by one env var.
 */
function stripePriceId(): string {
  const id = process.env.STRIPE_PRICE_ID
  if (!id) throw new Error('STRIPE_PRICE_ID is not set')
  return id
}

/** The price as Stripe holds it, read at most once an hour per id — not once per Checkout click. */
const fetchPlanPrice = unstable_cache(
  async (priceId: string) => {
    const price = await stripeClient().prices.retrieve(priceId)
    return {
      currency: price.currency,
      unitAmount: price.unit_amount,
      interval: price.recurring?.interval ?? null,
      intervalCount: price.recurring?.interval_count ?? null,
      taxBehavior: price.tax_behavior,
    }
  },
  ['stripe-plan-price'],
  { revalidate: 3600 }
)

/**
 * The price id Checkout sells, once Stripe confirms it is the plan's: euros, every month,
 * `PRO_PLAN.priceCents` (src/lib/billing/plans.ts) and VAT on top (tax behaviour `exclusive`, as the
 * app's "excl. VAT" says). Any other price throws here — before a customer is charged a sum the
 * app never showed them. `startCheckout` (src/features/settings/actions/billing-actions.ts) logs it, and the
 * person sees Stripe as unavailable.
 */
export async function verifiedPriceId(): Promise<string> {
  const id = stripePriceId()
  const price = await fetchPlanPrice(id)
  const matches =
    price.currency === 'eur' &&
    price.interval === 'month' &&
    price.intervalCount === 1 &&
    price.unitAmount === PRO_PLAN.priceCents &&
    price.taxBehavior === 'exclusive'
  if (!matches) {
    throw new Error(
      `STRIPE_PRICE_ID ${id} bills ${price.unitAmount} ${price.currency} every ${price.intervalCount} ${price.interval} with tax ${price.taxBehavior}, not ${PRO_PLAN.priceCents} eur a month with tax exclusive`
    )
  }
  return id
}

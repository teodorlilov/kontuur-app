import 'server-only'

import Stripe from 'stripe'

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
 * The one price a workspace can buy — €19 per client per month, created by hand in the
 * Dashboard for each mode and named here by its id, so test and live differ by one env var.
 */
export function stripePriceId(): string {
  const id = process.env.STRIPE_PRICE_ID
  if (!id) throw new Error('STRIPE_PRICE_ID is not set')
  return id
}

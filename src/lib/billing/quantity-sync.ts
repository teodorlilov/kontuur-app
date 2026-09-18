import 'server-only'

import { randomUUID } from 'crypto'
import Stripe from 'stripe'
import type { Entitlement } from './entitlement'
import { stripeClient } from './stripe'

/**
 * How a quantity change is billed: `charge` invoices the pro-rata difference now (a client
 * added), `credit` books a pro-rata credit (a client whose provisioning failed after Stripe had
 * charged for it), `none` changes nothing until the next renewal (a client deleted).
 */
type QuantityBilling = 'charge' | 'credit' | 'none'

const PRORATION: Record<QuantityBilling, Stripe.SubscriptionUpdateParams.ProrationBehavior> = {
  charge: 'always_invoice',
  credit: 'create_prorations',
  none: 'none',
}

/** A quantity increase Stripe could not charge — the sentence a person can act on. */
export class QuantityChargeError extends Error {
  constructor(cause: unknown) {
    super(
      cause instanceof Stripe.errors.StripeCardError
        ? `The card on file was declined: ${cause.message} Update it in Plan & billing and try again.`
        : 'The new client could not be added to your plan. Please try again.'
    )
    this.name = 'QuantityChargeError'
  }
}

/**
 * The subscription a workspace is billed on, or null when nothing is: the entitlement decides
 * whether the plan is live (the ONLY reader of the status column), the row supplies the id.
 */
export function billedSubscriptionId(
  entitlement: Pick<Entitlement, 'plan' | 'state'>,
  agency: { stripe_subscription_id: string | null } | null
): string | null {
  const live =
    entitlement.plan === 'pro' &&
    (entitlement.state === 'active' || entitlement.state === 'past_due')
  return live ? (agency?.stripe_subscription_id ?? null) : null
}

/**
 * The one place the client count reaches Stripe. The quantity written is absolute — the count,
 * never ±1 — so any later change heals an earlier miss. `error_if_incomplete` means a declined
 * pro-rata charge answers with an error and leaves the subscription as it was, rather than
 * applying the quantity and sliding it to past_due; the caller then adds no client. A fresh
 * idempotency key per call protects the SDK's own retries of one request and nothing else, so
 * 3→4→3→4 inside Stripe's 24-hour window never replays a stale answer.
 */
export async function syncSubscriptionQuantity(
  subscriptionId: string,
  quantity: number,
  billing: QuantityBilling
): Promise<void> {
  const stripe = stripeClient()
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const item = subscription.items.data[0]
  if (!item) throw new Error(`subscription ${subscriptionId} has no item to set a quantity on`)
  try {
    await stripe.subscriptions.update(
      subscriptionId,
      {
        items: [{ id: item.id, quantity: Math.max(1, quantity) }],
        proration_behavior: PRORATION[billing],
        payment_behavior: 'error_if_incomplete',
      },
      { idempotencyKey: randomUUID() }
    )
  } catch (err) {
    if (billing === 'charge') throw new QuantityChargeError(err)
    throw err
  }
}

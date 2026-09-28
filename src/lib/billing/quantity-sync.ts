import 'server-only'

import { randomUUID } from 'crypto'
import Stripe from 'stripe'
import type { AdminClient } from '@/lib/supabase/admin'
import { countClientsByAgency } from '@/lib/queries/db'
import { CLIENT_NOT_ADDED, QUANTITY_SYNC_BUSY, cardDeclined } from './copy'
import { isPaying, type Entitlement } from './entitlement'
import { billableQuantity } from './plans'
import { stripeClient } from './stripe'

/**
 * Stripe's smallest charge in euro, €0.50 (Stripe's supported-currencies page, "Minimum charge
 * amount by currency"). It holds while the account's payouts settle in euro; a charge converted to
 * another settlement currency must clear that currency's minimum instead. An invoice below it may
 * leave `amount_due` at 0 (node_modules/stripe/esm/resources/Invoices.d.ts), so a pro-rata amount
 * under it is left on the renewal invoice rather than invoiced on its own.
 */
const STRIPE_MIN_CHARGE_CENTS = 50

/**
 * Every Stripe request made under the claim is bounded: 10 s a try and one retry, plus the SDK's
 * 0.5 s back-off between them (INITIAL_NETWORK_RETRY_DELAY_SEC,
 * node_modules/stripe/esm/stripe.core.js). A retry of a write carries the same idempotency key.
 */
const STRIPE_REQUEST = { timeout: 10_000, maxNetworkRetries: 1 }

/**
 * How old a quantity claim may be before another write takes it over. It must outlast the work
 * it guards — up to three bounded requests (`STRIPE_REQUEST`), about 62 s at worst — so only a
 * holder whose invocation died is ever overtaken, never one whose write is still on its way.
 */
const CLAIM_STALE_MS = 70_000

/** How far apart a busy claim is tried again. */
const CLAIM_RETRY_MS = 1_000

/** A client the plan could not take on — the sentence a person can act on, from copy.ts. */
export class QuantityChargeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'QuantityChargeError'
  }
}

/**
 * Which way a sync may move the quantity, and what the period already paid for: an added client
 * raises it (never charging again below `paid`), a deleted one lowers it, and a new subscription
 * may do either. `paidFor` is the start of the period `paid` was paid for
 * (`agencies.current_period_start`); the count is honoured only while that is still Stripe's
 * current period, since a renewal moves Stripe's period before its invoice is paid.
 */
type QuantityChange =
  | { direction: 'decrease' }
  | { direction: 'increase' | 'both'; paid: number; paidFor: string | null }

/**
 * The subscription an added client may be charged on, or null when nothing may be charged: the
 * entitlement decides whether the plan is live (the ONLY reader of the status column), the row
 * supplies the id. A deleted client's decrease asks `openSubscriptionId` instead.
 */
export function billedSubscriptionId(
  entitlement: Pick<Entitlement, 'plan' | 'state'>,
  agency: { stripe_subscription_id: string | null } | null
): string | null {
  return isPaying(entitlement) ? (agency?.stripe_subscription_id ?? null) : null
}

/**
 * The subscription a deleted client's decrease lowers, or null when none is open. A decrease
 * never charges, so it runs for any open subscription (`Entitlement.subscriptionOpen`): a locked
 * workspace whose renewal failed past its grace, or a house one still paying, lowers Stripe's
 * count like any other. Only an increase needs the live plan (`billedSubscriptionId`).
 */
export function openSubscriptionId(
  entitlement: Pick<Entitlement, 'subscriptionOpen'>,
  agency: { stripe_subscription_id: string | null } | null
): string | null {
  return entitlement.subscriptionOpen ? (agency?.stripe_subscription_id ?? null) : null
}

/** The sentence for a failed increase, with Stripe's own error kept as the cause for the log. */
function chargeFailure(err: unknown): QuantityChargeError {
  return new QuantityChargeError(
    err instanceof Stripe.errors.StripeCardError ? cardDeclined(err.message) : CLIENT_NOT_ADDED,
    { cause: err }
  )
}

/** The count already paid for Stripe's current period: `paid`, or none once the period has moved on. */
function paidThisPeriod(
  change: { paid: number; paidFor: string | null },
  item: Stripe.SubscriptionItem
): number {
  const samePeriod =
    change.paidFor !== null && Date.parse(change.paidFor) === item.current_period_start * 1000
  return samePeriod ? change.paid : 0
}

/** The pro-rata cents Stripe would charge now for `units` more of the item, for what is left of its period. */
function proRataCents(item: Stripe.SubscriptionItem, units: number, now: Date): number {
  const length = item.current_period_end - item.current_period_start
  const left = Math.max(0, item.current_period_end - now.getTime() / 1000)
  return (item.price.unit_amount ?? 0) * units * (length > 0 ? left / length : 0)
}

/**
 * Write one quantity. A fresh idempotency key per call protects the SDK's own retries of one
 * request and nothing else, so 3→4→3→4 inside Stripe's 24-hour window never replays a stale
 * answer. `error_if_incomplete` means a declined charge answers with an error and leaves the
 * subscription as it was, rather than applying the quantity and sliding it to past_due.
 */
async function setQuantity(
  subscriptionId: string,
  item: Stripe.SubscriptionItem,
  quantity: number,
  proration: Stripe.SubscriptionUpdateParams.ProrationBehavior
): Promise<void> {
  await stripeClient().subscriptions.update(
    subscriptionId,
    {
      items: [{ id: item.id, quantity }],
      proration_behavior: proration,
      payment_behavior: 'error_if_incomplete',
    },
    { ...STRIPE_REQUEST, idempotencyKey: randomUUID() }
  )
}

/**
 * Raise Stripe's quantity `current` to the client count `target`, charging only for clients not
 * already paid for this period: the part up to `paid` is restored uncharged, and only the part
 * above both is charged — at once, or on the renewal when the amount is under Stripe's minimum.
 */
async function raiseQuantity(
  subscriptionId: string,
  item: Stripe.SubscriptionItem,
  current: number,
  target: number,
  paid: number
): Promise<void> {
  let reached = current
  if (reached < paid) {
    reached = Math.min(paid, target)
    await setQuantity(subscriptionId, item, reached, 'none')
  }
  if (target <= reached) return
  const tooSmall = proRataCents(item, target - reached, new Date()) < STRIPE_MIN_CHARGE_CENTS
  await setQuantity(subscriptionId, item, target, tooSmall ? 'create_prorations' : 'always_invoice')
}

/**
 * Take the workspace's quantity claim: a compare-and-set on `agencies.quantity_sync_at`, the
 * shape `claimPublication` uses (src/features/publishing/lib/publication-store.ts). The stamp to
 * release with, or null while another write holds a claim younger than `CLAIM_STALE_MS`.
 */
async function claimQuantity(admin: AdminClient, agencyId: string): Promise<string | null> {
  const stamp = new Date().toISOString()
  const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString()
  const { data, error } = await admin
    .from('agencies')
    .update({ quantity_sync_at: stamp })
    .eq('id', agencyId)
    .or(`quantity_sync_at.is.null,quantity_sync_at.lt.${staleBefore}`)
    .select('id')
  if (error) throw new Error(`quantity claim failed for ${agencyId}: ${error.message}`)
  return data.length > 0 ? stamp : null
}

/**
 * Give the claim back — only this holder's, by its stamp. A failed release is logged rather than
 * thrown: throwing here would replace the sync's own outcome, and the claim goes stale on its own
 * after `CLAIM_STALE_MS`.
 */
async function releaseQuantity(admin: AdminClient, agencyId: string, stamp: string): Promise<void> {
  const { error } = await admin
    .from('agencies')
    .update({ quantity_sync_at: null })
    .eq('id', agencyId)
    .eq('quantity_sync_at', stamp)
  if (error)
    console.error(`[billing:quantity] claim release failed for ${agencyId}:`, error.message)
}

/**
 * Run `work` under the claim. A busy claim is waited out until its holder releases it or it goes
 * stale, because the holder counts every client row, including one inserted by the waiting
 * create, and may already have charged for it: giving way earlier would undo a client that was
 * paid for. Only a claim taken again by yet another change before this one gets in gives way.
 */
async function underQuantityClaim(
  admin: AdminClient,
  agencyId: string,
  work: () => Promise<void>
): Promise<void> {
  const attempts = Math.ceil(CLAIM_STALE_MS / CLAIM_RETRY_MS) + 1
  for (let attempt = 1; ; attempt++) {
    const stamp = await claimQuantity(admin, agencyId)
    if (stamp) {
      try {
        return await work()
      } finally {
        await releaseQuantity(admin, agencyId, stamp)
      }
    }
    if (attempt === attempts) throw new QuantityChargeError(QUANTITY_SYNC_BUSY)
    await new Promise((resolve) => setTimeout(resolve, CLAIM_RETRY_MS))
  }
}

/**
 * The one place the client count reaches Stripe. Under the workspace's claim
 * (`underQuantityClaim`) it counts the clients and reads Stripe's quantity, so two changes never
 * write from a stale read; the quantity written is absolute (`billableQuantity`) and moves only the
 * way `change` allows. A decrease is never charged or credited — deleting a client refunds nothing;
 * an increase charges only above what Stripe's current period has paid for (`raiseQuantity`). An
 * over-count a failed decrease leaves is lowered later (`reconcileQuantity`,
 * src/lib/billing/stripe-events.ts). Every Stripe failure of an increase, the read included, and a
 * claim that never came free throw `QuantityChargeError`, with Stripe's error as its `cause`.
 */
export async function syncSubscriptionQuantity(
  admin: AdminClient,
  agencyId: string,
  subscriptionId: string,
  change: QuantityChange
): Promise<void> {
  await underQuantityClaim(admin, agencyId, async () => {
    const target = billableQuantity(await countClientsByAgency(admin, agencyId))
    try {
      const subscription = await stripeClient().subscriptions.retrieve(
        subscriptionId,
        {},
        STRIPE_REQUEST
      )
      const item = subscription.items.data[0]
      if (!item) throw new Error(`subscription ${subscriptionId} has no item to set a quantity on`)
      const current = item.quantity ?? 1
      if (target > current && change.direction !== 'decrease') {
        await raiseQuantity(subscriptionId, item, current, target, paidThisPeriod(change, item))
      } else if (target < current && change.direction !== 'increase') {
        await setQuantity(subscriptionId, item, target, 'none')
      }
    } catch (err) {
      throw change.direction === 'increase' ? chargeFailure(err) : err
    }
  })
}

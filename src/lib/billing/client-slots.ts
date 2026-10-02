import 'server-only'

import Stripe from 'stripe'
import type { AdminClient } from '@/lib/supabase/admin'
import {
  SLOTS_BANK_CONFIRMATION,
  SLOTS_BUSY,
  SLOTS_CHANGED_ELSEWHERE,
  SLOTS_RENEWAL_PENDING,
  cardDeclined,
  type SlotChangeOutcome,
} from './copy'
import { chargesToday, slotChange } from './plans'
import { stripeClient } from './stripe'
import { applySubscriptionSnapshot, slotItemOf } from './subscription-store'

/**
 * The retrieve and the update are bounded: 10 s a try and one retry, plus the SDK's 0.5 s back-off
 * between them (INITIAL_NETWORK_RETRY_DELAY_SEC, node_modules/stripe/esm/stripe.core.js). The SDK
 * keys every write afresh and keeps that key across its own retries (`_defaultIdempotencyKey`,
 * node_modules/stripe/esm/RequestSender.js), so a retry cannot apply a change twice and a later
 * identical change is never answered from an old one.
 */
const STRIPE_REQUEST = { timeout: 10_000, maxNetworkRetries: 1 }

/**
 * How old a claim may be before another change takes it over. It must outlast the work it guards —
 * the retrieve and the update (`STRIPE_REQUEST`), about 41 s at worst — so only a holder whose
 * invocation died is overtaken. The snapshot after the update needs no guard and is not bounded the
 * same way: a change that takes over by then reads Stripe's new count.
 */
const CLAIM_STALE_MS = 70_000

/** A slot change refused or declined — the sentence a person can act on, from copy.ts. */
export class SlotChangeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SlotChangeError'
  }
}

/**
 * A change Stripe made whose row could not be written after it. The change stands — the card may
 * already be charged — so the caller reports `outcome`, not a failure; the webhook's snapshot of
 * the same subscription writes the row.
 */
export class SlotSnapshotError extends Error {
  constructor(
    readonly outcome: SlotChangeOutcome,
    options: ErrorOptions
  ) {
    super('slot change made, row not written', options)
    this.name = 'SlotSnapshotError'
  }
}

/**
 * A slot change as the person asked for it: `from` is the ordered count they saw, `paid` the slots
 * already billed this period (`Entitlement.brandsPaid`), `periodStart` the period their confirm
 * was priced on, which the action has already held against `agencies.current_period_start`.
 */
interface SlotRequest {
  from: number
  to: number
  paid: number
  periodStart: string
}

/**
 * The card errors that mean the bank wants the cardholder to confirm the payment (3-D Secure)
 * rather than a decline — `StripeError.code` values (node_modules/stripe/esm/resources/
 * Invoices.d.ts, `LastFinalizationError.Code`).
 */
const BANK_CONFIRMATION_CODES = new Set([
  'authentication_required',
  'invoice_payment_intent_requires_action',
  'payment_intent_action_required',
])

/**
 * Write one quantity. `error_if_incomplete` makes a charge that does not go through an error that
 * leaves the subscription as it was: a bank asking for confirmation comes back as
 * `SLOTS_BANK_CONFIRMATION`, which the app cannot take yet, and a declined card as `cardDeclined`
 * in the card's own words — both `SlotChangeError`. The latest invoice is expanded so a charge's
 * paid invoice reaches the snapshot without a read.
 */
async function setQuantity(
  subscriptionId: string,
  item: Stripe.SubscriptionItem,
  quantity: number,
  proration: Stripe.SubscriptionUpdateParams.ProrationBehavior
): Promise<Stripe.Subscription> {
  try {
    return await stripeClient().subscriptions.update(
      subscriptionId,
      {
        items: [{ id: item.id, quantity }],
        proration_behavior: proration,
        payment_behavior: 'error_if_incomplete',
        expand: ['latest_invoice'],
      },
      STRIPE_REQUEST
    )
  } catch (err) {
    if (!(err instanceof Stripe.errors.StripeCardError)) throw err
    const sentence = BANK_CONFIRMATION_CODES.has(err.code ?? '')
      ? SLOTS_BANK_CONFIRMATION
      : cardDeclined(err.message)
    throw new SlotChangeError(sentence, { cause: err })
  }
}

/**
 * Take the workspace's quantity claim: a compare-and-set on `agencies.quantity_sync_at`, the
 * shape `claimPublication` uses (src/features/publishing/lib/publication-store.ts). The stamp to
 * release with, or null while another change holds a claim younger than `CLAIM_STALE_MS`.
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
 * thrown: throwing here would replace the change's own outcome, and the claim goes stale on its
 * own after `CLAIM_STALE_MS`.
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
 * Run `work` under the claim, or refuse at once while another change holds it. Two windows
 * changing slots together would otherwise both read the same count: one raises 3→6 while the
 * other, having read 3, writes 4 with a charge, and Stripe credits the 6 it billed against the 4 —
 * a customer credit `refuseBalances` (src/lib/billing/documents.ts) will not document.
 */
async function underQuantityClaim<T>(
  admin: AdminClient,
  agencyId: string,
  work: () => Promise<T>
): Promise<T> {
  const stamp = await claimQuantity(admin, agencyId)
  if (!stamp) throw new SlotChangeError(SLOTS_BUSY)
  try {
    return await work()
  } finally {
    await releaseQuantity(admin, agencyId, stamp)
  }
}

/**
 * Refuse a change made from a view Stripe no longer matches. Another window changed the count: the
 * row is first written from Stripe's own copy, so a reload shows the count Stripe holds — which also
 * heals a row that drifted from Stripe some other way. Or a renewal has moved Stripe's period ahead
 * of the row's: Stripe moves it before the renewal is paid, and the row's paid count would then
 * price the wrong period.
 */
async function refuseStaleChange(
  admin: AdminClient,
  subscription: Stripe.Subscription,
  live: ReturnType<typeof slotItemOf>,
  request: SlotRequest
): Promise<void> {
  if (live.slots !== request.from) {
    await applySubscriptionSnapshot(admin, subscription)
    throw new SlotChangeError(SLOTS_CHANGED_ELSEWHERE)
  }
  if (Date.parse(request.periodStart) !== live.period.start.getTime()) {
    throw new SlotChangeError(SLOTS_RENEWAL_PENDING)
  }
}

/** What a written change did, for the toast (`slotsChanged`, src/lib/billing/copy.ts). */
function outcomeOf(kind: 'raise' | 'restore' | 'lower', today: boolean): SlotChangeOutcome {
  if (kind === 'raise') return today ? 'charged' : 'on_renewal'
  return kind === 'restore' ? 'restored' : 'lowered'
}

/** The paid invoice an update came back with, or undefined — an id, or one not yet paid, is none. */
function paidInvoiceOf(subscription: Stripe.Subscription): Stripe.Invoice | undefined {
  const invoice = subscription.latest_invoice
  return invoice && typeof invoice !== 'string' && invoice.status === 'paid' ? invoice : undefined
}

/**
 * Set the workspace's client slots — the one place a slot count reaches Stripe. `slotChange`
 * (src/lib/billing/plans.ts) decides what the change is: no change answers 'same' before any claim
 * or Stripe call; otherwise, under the claim and after `refuseStaleChange`, it picks ONE update:
 * charged at once (`always_invoice`), left on the renewal when under Stripe's minimum
 * (`create_prorations`), or uncharged (`none`) for a restore or a lower. The snapshot then writes
 * the new count, and after a charge the paid count from its invoice, before the webhook's copy
 * arrives; if that write fails the change still stands (`SlotSnapshotError`). A charge that does
 * not go through, a busy claim and both refusals throw `SlotChangeError`; anything else propagates.
 */
export async function setClientSlots(
  admin: AdminClient,
  agencyId: string,
  subscriptionId: string,
  request: SlotRequest
): Promise<SlotChangeOutcome> {
  const change = slotChange(request.from, request.to, request.paid)
  if (change.kind === 'same') return 'same'
  const { kind, charged } = change
  return underQuantityClaim(admin, agencyId, async () => {
    const subscription = await stripeClient().subscriptions.retrieve(
      subscriptionId,
      {},
      STRIPE_REQUEST
    )
    const live = slotItemOf(subscription)
    await refuseStaleChange(admin, subscription, live, request)
    const today = kind === 'raise' && chargesToday(charged, live.period, new Date())
    const proration = kind !== 'raise' ? 'none' : today ? 'always_invoice' : 'create_prorations'
    const updated = await setQuantity(subscriptionId, live.item, request.to, proration)
    const outcome = outcomeOf(kind, today)
    await applySubscriptionSnapshot(
      admin,
      updated,
      today ? paidInvoiceOf(updated) : undefined
    ).catch((err: unknown) => {
      throw new SlotSnapshotError(outcome, { cause: err })
    })
    return outcome
  })
}

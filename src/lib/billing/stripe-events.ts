/**
 * What a verified Stripe event does in this app: the one code path that writes `billing_events`
 * (`recordBillingEvent` before any work, `finishBillingEvent` after it) and the dispatch between
 * them (`handleEvent`). The webhook route (src/app/api/billing/webhook/route.ts) verifies the
 * signature and composes the three.
 */
import 'server-only'

import { after } from 'next/server'
import type Stripe from 'stripe'
import type { AdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/database'
import { isoFromUnixSeconds } from '@/utils/date-helpers'
import { chargedMoney, deliverSaleDocument, issueCreditNote, issueSaleDocument } from './documents'
import { hasSubscriptionEnded } from './entitlement'
import { syncSubscriptionQuantity } from './quantity-sync'
import { remindPaymentFailed } from './reminders'
import { stripeClient } from './stripe'
import { applySubscriptionSnapshot } from './subscription-store'

type EventPayload = Database['public']['Tables']['billing_events']['Insert']['payload']

interface Handled {
  agencyId: string | null
  outcome: string
  /**
   * What the log line should add to the outcome — both ids of a subscription conflict, the
   * invoice of an undocumented sale, how a failed payment's reminder went, a failed reconcile.
   */
  detail?: string
  /** The boundary logs at error level when the event needs someone's eyes. */
  level?: 'error'
}

/**
 * The id of the event's object for its `billing_events` row, or null. Read without trusting the
 * SDK's types: an upcoming invoice has no id although `Stripe.Invoice` types one (the
 * `InvoiceUpcomingEvent` doc, node_modules/stripe/esm/resources/Events.d.ts). The row is keyed on
 * the event id, never on this.
 */
function objectIdOf(event: Stripe.Event): string | null {
  const object: unknown = event.data.object
  return typeof object === 'object' &&
    object !== null &&
    'id' in object &&
    typeof object.id === 'string'
    ? object.id
    : null
}

function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription
  if (!subscription) return null
  return typeof subscription === 'string' ? subscription : subscription.id
}

/**
 * Record the event before any work, and say whether it was already handled. The insert ignores
 * a duplicate id and the row is read back: an event whose row carries `processed_at` was
 * handled and is answered 200 with nothing done; one whose row is there without it failed
 * before and runs again, which is what a Stripe retry after a 500 needs. Two deliveries of one
 * event may both run — every write the handler makes is idempotent, so that is harmless. A failed
 * write or read-back throws.
 *
 * WHY as: a Stripe event is plain JSON, which the generated Json type cannot name structurally.
 */
export async function recordBillingEvent(
  admin: AdminClient,
  event: Stripe.Event
): Promise<'new' | 'processed'> {
  const { error } = await admin.from('billing_events').upsert(
    {
      id: event.id,
      type: event.type,
      created: isoFromUnixSeconds(event.created),
      object_id: objectIdOf(event),
      payload: event as unknown as EventPayload,
    },
    { onConflict: 'id', ignoreDuplicates: true }
  )
  if (error) throw new Error(`billing_events write failed for ${event.id}: ${error.message}`)
  const { data, error: readError } = await admin
    .from('billing_events')
    .select('processed_at')
    .eq('id', event.id)
    .single()
  if (readError) throw new Error(`billing_events read failed for ${event.id}: ${readError.message}`)
  return data.processed_at ? 'processed' : 'new'
}

/**
 * Stamp the row with what happened: the workspace it turned out to concern, and the error if any.
 * A failed stamp is logged rather than thrown, so it never changes the answer Stripe gets.
 */
export async function finishBillingEvent(
  admin: AdminClient,
  eventId: string,
  agencyId: string | null,
  error: string | null
): Promise<void> {
  const { error: writeError } = await admin
    .from('billing_events')
    .update({ processed_at: error ? null : new Date().toISOString(), agency_id: agencyId, error })
    .eq('id', eventId)
  if (writeError)
    console.error(`[billing:webhook] finish failed for ${eventId}:`, writeError.message)
}

/**
 * Bring Stripe's quantity to the client count after a snapshot that may have left them apart,
 * while the subscription is open (`hasSubscriptionEnded`). A new subscription may move either way
 * (clients changed while Checkout was open), charging only above what it was bought for, in that
 * period. The row's own subscription is only lowered, never raised, after a paid period or with a
 * renewal ahead (`renewalAhead`,
 * an upcoming invoice), so a delete whose own decrease failed is not billed another period; a
 * decrease never charges, so a locked workspace is lowered too. A failure comes back as a sentence
 * for the log line and the event still succeeds: an under-count heals on the next add, an
 * over-count before the next renewal or once it is paid (`syncSubscriptionQuantity`).
 */
async function reconcileQuantity(
  admin: AdminClient,
  snapshot: Handled,
  subscription: Stripe.Subscription,
  renewalAhead = false
): Promise<string | null> {
  const { agencyId, outcome } = snapshot
  const lowers = outcome === 'period_paid' || (renewalAhead && outcome === 'written')
  if (!agencyId || hasSubscriptionEnded(subscription.status)) return null
  if (outcome !== 'started' && !lowers) return null
  const item = subscription.items.data[0]
  const change: Parameters<typeof syncSubscriptionQuantity>[3] =
    outcome === 'started'
      ? {
          direction: 'both',
          paid: item?.quantity ?? 1,
          paidFor: item ? isoFromUnixSeconds(item.current_period_start) : null,
        }
      : { direction: 'decrease' }
  return syncSubscriptionQuantity(admin, agencyId, subscription.id, change).then(
    () => null,
    (err: unknown) =>
      `quantity reconcile failed: ${err instanceof Error ? err.message : String(err)}`
  )
}

/** The event's outcome with one more sentence for its log line, at error level when it needs eyes. */
function withDetail(handled: Handled, said: string | null, needsEyes: boolean): Handled {
  if (!said) return handled
  return {
    ...handled,
    detail: [handled.detail, said].filter(Boolean).join('; '),
    ...(needsEyes ? { level: 'error' as const } : {}),
  }
}

/**
 * A paid invoice that took money but gets no document — one this app did not create, such as an
 * invoice made in the Stripe Dashboard, which the runbook does not support (docs/n18/README.md).
 * The boundary logs it at error level with the invoice; the event succeeds, since retrying cannot
 * give it a document, and the monthly routine finds it again from the stored event
 * (supabase/queries/undocumented-sales.sql).
 */
function undocumentedSale(invoice: Stripe.Invoice): Handled {
  return {
    agencyId: null,
    outcome: 'undocumented_sale',
    detail: `invoice ${invoice.id} took ${invoice.amount_paid} cents and has no document`,
    level: 'error',
  }
}

/**
 * A failed payment's snapshot with how its reminder went added to the boundary's line — at error
 * level when the bell could not be written, no admin could be mailed, or the mail was refused.
 */
function withReminder(
  snapshot: Handled,
  reminded: NonNullable<Awaited<ReturnType<typeof remindPaymentFailed>>>
): Handled {
  const failed = reminded.outcome === 'send_failed'
  const said = failed ? `reminder send_failed: ${reminded.error}` : `reminder ${reminded.outcome}`
  const needsEyes = failed || reminded.outcome === 'unwritten' || reminded.outcome === 'no_admin'
  return withDetail(snapshot, said, needsEyes)
}

/**
 * One event → the current truth about its subscription, written once. Every subscription and
 * invoice event re-fetches the subscription rather than trusting the event's copy, so ordering
 * never matters. A paid invoice of a subscription this app made becomes its document
 * (`issueSaleDocument` decides which), delivered after the response, even one paid after its
 * workspace was deleted (`no_workspace`); one that took money with no such subscription is an
 * `undocumentedSale`. An upcoming invoice arrives only while Stripe Billing → Subscriptions sends
 * upcoming-renewal events (docs/n18/README.md); it is what lowers the count before a renewal. A
 * failure throws, for the caller to stamp on the row.
 */
export async function handleEvent(admin: AdminClient, event: Stripe.Event): Promise<Handled> {
  const stripe = stripeClient()
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = await stripe.subscriptions.retrieve(event.data.object.id)
      const snapshot = await applySubscriptionSnapshot(admin, subscription)
      return withDetail(snapshot, await reconcileQuantity(admin, snapshot, subscription), true)
    }
    case 'invoice.paid':
    case 'invoice.payment_failed':
    case 'invoice.upcoming': {
      const invoice = event.data.object
      const paid = event.type === 'invoice.paid'
      const subscriptionId = subscriptionIdOf(invoice)
      if (!subscriptionId) {
        return paid && chargedMoney(invoice)
          ? undocumentedSale(invoice)
          : { agencyId: null, outcome: 'ignored' }
      }
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const applied = paid
        ? await applySubscriptionSnapshot(admin, subscription, invoice)
        : await applySubscriptionSnapshot(admin, subscription)
      const reconciled = await reconcileQuantity(
        admin,
        applied,
        subscription,
        event.type === 'invoice.upcoming'
      )
      const snapshot = withDetail(applied, reconciled, true)
      if (paid && (snapshot.agencyId !== null || snapshot.outcome === 'no_workspace')) {
        const document = await issueSaleDocument(admin, {
          invoiceId: invoice.id,
          agencyId: snapshot.agencyId,
        })
        if (document) after(() => deliverSaleDocument(admin, document.id))
      } else if (paid && chargedMoney(invoice)) {
        return undocumentedSale(invoice)
      }
      if (event.type === 'invoice.payment_failed' && snapshot.agencyId) {
        const reminded = await remindPaymentFailed(admin, snapshot.agencyId)
        if (reminded) return withReminder(snapshot, reminded)
      }
      return snapshot
    }
    case 'credit_note.created': {
      const document = await issueCreditNote(admin, event.data.object.id)
      if (!document) return { agencyId: null, outcome: 'ignored' }
      after(() => deliverSaleDocument(admin, document.id))
      return { agencyId: document.agency_id, outcome: 'credit_note' }
    }
    default:
      return { agencyId: null, outcome: 'ignored' }
  }
}

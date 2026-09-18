import { after, NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { stripeClient } from '@/lib/billing/stripe'
import { applySubscriptionSnapshot } from '@/lib/billing/subscription-store'
import { deliverSaleDocument, issueCreditNote, issueSaleDocument } from '@/lib/billing/documents'
import { remindPaymentFailed } from '@/lib/billing/reminders'
import type { Database } from '@/types/database'

export const maxDuration = 60

type Admin = ReturnType<typeof createAdminSupabaseClient>
type EventPayload = Database['public']['Tables']['billing_events']['Insert']['payload']

interface Handled {
  agencyId: string | null
  outcome: string
}

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
 * event may both run — every write the handler makes is idempotent, so that is harmless.
 */
async function recordBillingEvent(admin: Admin, event: Stripe.Event): Promise<'new' | 'processed'> {
  const { error } = await admin.from('billing_events').upsert(
    {
      id: event.id,
      type: event.type,
      created: new Date(event.created * 1000).toISOString(),
      object_id: objectIdOf(event),
      // WHY as: a Stripe event is plain JSON, which the generated Json type cannot name structurally.
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

/** Stamp the row with what happened: the workspace it turned out to concern, and the error if any. */
async function finishBillingEvent(
  admin: Admin,
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
 * One event → the current truth about its subscription, written once. Every subscription and
 * invoice event re-fetches the subscription rather than trusting the event's copy, so ordering
 * never matters. A paid invoice with money on it also becomes its document, delivered after the
 * response; a failed one tells the workspace's admins; a credit note that refunded money becomes
 * its credit note the same way. Unknown types are recorded and ignored.
 */
async function handleEvent(admin: Admin, event: Stripe.Event): Promise<Handled> {
  const stripe = stripeClient()
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = await stripe.subscriptions.retrieve(event.data.object.id)
      return applySubscriptionSnapshot(
        admin,
        subscription,
        event.type === 'customer.subscription.created' ? 'subscription_created' : 'subscription'
      )
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object
      const subscriptionId = subscriptionIdOf(invoice)
      if (!subscriptionId) return { agencyId: null, outcome: 'ignored' }
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const paid = event.type === 'invoice.paid'
      const snapshot = await applySubscriptionSnapshot(
        admin,
        subscription,
        paid ? 'invoice_paid' : 'invoice_failed'
      )
      if (paid && snapshot.agencyId && invoice.amount_paid > 0) {
        const document = await issueSaleDocument(admin, {
          invoiceId: invoice.id,
          agencyId: snapshot.agencyId,
        })
        if (document) after(() => deliverSaleDocument(admin, document.id))
      }
      if (!paid && snapshot.agencyId) await remindPaymentFailed(admin, snapshot.agencyId)
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

/**
 * Stripe's webhook. The body is proven by Stripe's signature over the raw bytes, then the object
 * is re-fetched, so no schema parses it. A processing failure answers 500 so Stripe retries;
 * the row keeps the error until a retry succeeds.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[billing:webhook] STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  }

  const payload = await request.text()
  let event: Stripe.Event
  try {
    event = stripeClient().webhooks.constructEvent(
      payload,
      request.headers.get('stripe-signature') ?? '',
      secret
    )
  } catch (err) {
    console.error('[billing:webhook] signature rejected:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  if ((await recordBillingEvent(admin, event)) === 'processed') {
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    const handled = await handleEvent(admin, event)
    await finishBillingEvent(admin, event.id, handled.agencyId, null)
    console.info(`[billing:webhook] ${event.type} ${event.id}: ${handled.outcome}`)
    return NextResponse.json({ received: true, outcome: handled.outcome })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await finishBillingEvent(admin, event.id, null, message)
    console.error(`[billing:webhook] ${event.type} ${event.id} failed:`, err)
    return NextResponse.json({ error: 'Event failed' }, { status: 500 })
  }
}

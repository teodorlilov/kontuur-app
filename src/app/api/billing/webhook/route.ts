import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { stripeClient } from '@/lib/billing/stripe'
import { finishBillingEvent, handleEvent, recordBillingEvent } from '@/lib/billing/stripe-events'

/**
 * Room for a quantity reconcile that waits out another change's claim (`CLAIM_STALE_MS`,
 * src/lib/billing/quantity-sync.ts) before its own Stripe requests.
 */
export const maxDuration = 300

/**
 * Stripe's webhook. The body is proven by Stripe's signature over the raw bytes, so no schema
 * parses it; the event is then recorded, handled and stamped (`recordBillingEvent`, `handleEvent`,
 * `finishBillingEvent`, src/lib/billing/stripe-events.ts), and its one log line is written here. A
 * processed duplicate answers 200 with nothing done; a processing failure answers 500 so Stripe
 * retries, and the row keeps the error until a retry succeeds.
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
    const detail = handled.detail ? ` — ${handled.detail}` : ''
    const line = `[billing:webhook] ${event.type} ${event.id}: ${handled.outcome}${detail}`
    if (handled.level === 'error') console.error(line)
    else console.info(line)
    return NextResponse.json({ received: true, outcome: handled.outcome })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await finishBillingEvent(admin, event.id, null, message)
    console.error(`[billing:webhook] ${event.type} ${event.id} failed:`, err)
    return NextResponse.json({ error: 'Event failed' }, { status: 500 })
  }
}

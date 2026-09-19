import 'server-only'

import { revalidateTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import type { Database } from '@/types/database'
import { AGENCY_SNAPSHOT_COLUMNS } from '@/lib/queries/select-columns'
import { stripeClient } from './stripe'

type Admin = SupabaseClient<Database>
type AgencyUpdate = Database['public']['Tables']['agencies']['Update']

/** Which event a snapshot is written for — it decides which columns the snapshot may touch. */
type SnapshotTrigger = 'subscription_created' | 'subscription' | 'invoice_paid' | 'invoice_failed'

function isoFromUnix(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}

/**
 * The Stripe Customer for a workspace, created on first use and remembered on the row — the one
 * writer of `stripe_customer_id`. `metadata.agency_id` is how every later event finds its way
 * back to the workspace (Checkout copies it onto the subscription). The idempotency key means a
 * retry after a lost row write finds the same customer rather than making a second one.
 * `STRIPE_TEST_CLOCK`, test mode only, puts the customer under a test clock so a renewal can be
 * advanced in the end-to-end run.
 */
export async function ensureStripeCustomer(
  admin: Admin,
  agency: { id: string; name: string; stripe_customer_id: string | null }
): Promise<string> {
  if (agency.stripe_customer_id) return agency.stripe_customer_id
  const testClock = process.env.STRIPE_TEST_CLOCK
  const customer = await stripeClient().customers.create(
    {
      name: agency.name,
      metadata: { agency_id: agency.id },
      ...(testClock ? { test_clock: testClock } : {}),
    },
    { idempotencyKey: `customer:${agency.id}` }
  )
  const { error } = await admin
    .from('agencies')
    .update({ stripe_customer_id: customer.id })
    .eq('id', agency.id)
  if (error) throw new Error(`stripe_customer_id write failed for ${agency.id}: ${error.message}`)
  revalidateTag('agencies', 'max')
  return customer.id
}

/**
 * Write what a subscription says onto its agency row — the ONE writer of the billing columns.
 *
 * The subscription is the one the caller just re-fetched, never the event's own copy, so the
 * order events arrive in does not matter: whatever came last wrote the current truth. Which
 * subscription owns the row: the stored id, or the one a `customer.subscription.created`
 * announces — a late event for any other (the cancelled one after a re-subscription) is
 * ignored. The period columns are written when the row has none yet (the first snapshot, so a
 * paying customer is never locked between `subscription.created` and `invoice.paid`) and on a
 * paid invoice, never on any other event: a failed renewal advances Stripe's period but must not
 * hand the grace days a fresh allowance (`entitlementFor`). `past_due_since` starts on a failed
 * invoice and clears on a paid one — both unconditional, both idempotent by invoice. A
 * subscription that carries no `agency_id` was not made by this app and is ignored. One whose
 * workspace has been deleted (the row is gone — `deleteWorkspace`, and the subscription ends on
 * its own afterwards) is `no_workspace` with no agency id, so the caller records the event with
 * no owner rather than stamping an id the foreign key would refuse.
 */
export async function applySubscriptionSnapshot(
  admin: Admin,
  subscription: Stripe.Subscription,
  trigger: SnapshotTrigger
): Promise<{ agencyId: string | null; outcome: 'written' | 'ignored' | 'no_workspace' }> {
  const agencyId = subscription.metadata.agency_id
  if (!agencyId) return { agencyId: null, outcome: 'ignored' }

  const { data: row, error } = await admin
    .from('agencies')
    .select(AGENCY_SNAPSHOT_COLUMNS)
    .eq('id', agencyId)
    .maybeSingle()
  if (error) throw new Error(`agency read failed for ${agencyId}: ${error.message}`)
  if (!row) return { agencyId: null, outcome: 'no_workspace' }

  const owned =
    row.stripe_subscription_id === null ||
    row.stripe_subscription_id === subscription.id ||
    trigger === 'subscription_created'
  if (!owned) return { agencyId, outcome: 'ignored' }

  const item = subscription.items.data[0]
  const update: AgencyUpdate = {
    plan: 'pro',
    subscription_status: subscription.status,
    stripe_subscription_id: subscription.id,
    subscription_quantity: item?.quantity ?? 1,
    cancel_at_period_end: subscription.cancel_at_period_end,
    billing_updated_at: new Date().toISOString(),
  }
  if (item && (trigger === 'invoice_paid' || row.current_period_start === null)) {
    update.current_period_start = isoFromUnix(item.current_period_start)
    update.current_period_end = isoFromUnix(item.current_period_end)
  }
  if (trigger === 'invoice_paid') update.past_due_since = null
  if (trigger === 'invoice_failed' && row.past_due_since === null) {
    update.past_due_since = new Date().toISOString()
  }

  const { error: writeError } = await admin.from('agencies').update(update).eq('id', agencyId)
  if (writeError) throw new Error(`snapshot write failed for ${agencyId}: ${writeError.message}`)
  revalidateTag('agencies', 'max')
  return { agencyId, outcome: 'written' }
}

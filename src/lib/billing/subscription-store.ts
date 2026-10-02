import 'server-only'

import { revalidateTag } from 'next/cache'
import type Stripe from 'stripe'
import type { Database } from '@/types/database'
import { AGENCY_SNAPSHOT_COLUMNS } from '@/lib/queries/select-columns'
import type { AdminClient } from '@/lib/supabase/admin'
import { dateFromUnixSeconds } from '@/utils/date-helpers'
import { hasPaymentFailed, hasSubscriptionEnded } from './entitlement'
import { invoiceLines, stripeClient } from './stripe'

type AgencyUpdate = Database['public']['Tables']['agencies']['Update']

/**
 * The subscription's one item, its client slots (Stripe's quantity, 1 when unset) and its period.
 * Checkout sells one line (`createCheckoutSession`, src/lib/billing/checkout.ts), so every Kontuur
 * subscription has exactly one item; one with none throws rather than write a row from nothing.
 * The one reading of the item for the snapshot and the slot change (`setClientSlots`,
 * src/lib/billing/client-slots.ts).
 */
export function slotItemOf(subscription: Stripe.Subscription): {
  item: Stripe.SubscriptionItem
  slots: number
  period: { start: Date; end: Date }
} {
  const item = subscription.items.data[0]
  if (!item) throw new Error(`subscription ${subscription.id} has no item`)
  return {
    item,
    slots: item.quantity ?? 1,
    period: {
      start: dateFromUnixSeconds(item.current_period_start),
      end: dateFromUnixSeconds(item.current_period_end),
    },
  }
}

/**
 * Invoice lines for the subscription's item in its current period — Stripe's line shape is
 * `InvoiceLineItem.parent.subscription_item_details` (node_modules/stripe/esm/resources/
 * InvoiceLineItems.d.ts). A line billed for an earlier period ends before the current one. Pass
 * every line (`invoiceLines`, src/lib/billing/stripe.ts): a renewal's own line can sit past the
 * handful Stripe embeds.
 */
function currentLines(
  lines: Stripe.InvoiceLineItem[],
  item: Stripe.SubscriptionItem
): Stripe.InvoiceLineItem[] {
  return lines.filter(
    (line) =>
      line.parent?.subscription_item_details?.subscription_item === item.id &&
      line.period.end === item.current_period_end
  )
}

/**
 * Whether a paid invoice pays for the subscription's current period: it bills the item for that
 * period on a line that is not a proration — a subscription's first invoice, or a renewal. Only
 * that moves the period. A pro-rata charge inside the period does not, and neither does a late
 * or repeated delivery of an earlier period's invoice, whose lines end before the current one.
 */
function paysCurrentPeriod(
  lines: Stripe.InvoiceLineItem[],
  item: Stripe.SubscriptionItem
): boolean {
  return currentLines(lines, item).some(
    (line) => !line.parent?.subscription_item_details?.proration
  )
}

/**
 * The client slots paid for in the subscription's current period: the highest count any paid
 * invoice charged for it, or null while none has. The period's own invoice bills the count on its
 * non-proration line; a slot raise charged at once (`setClientSlots`,
 * src/lib/billing/client-slots.ts) bills the new count on a positive proration line. Read from all
 * the period's paid invoices and every line of each, not the one just delivered, so the answer is
 * the same whatever order they were paid and delivered in. The count never falls inside a period,
 * because lowering the client slots refunds nothing (`setClientSlots`' `none`).
 */
async function paidQuantity(
  subscriptionId: string,
  item: Stripe.SubscriptionItem
): Promise<number | null> {
  const paid = await stripeClient().invoices.list({
    subscription: subscriptionId,
    status: 'paid',
    created: { gte: item.current_period_start },
    limit: 100,
  })
  const lines = (await Promise.all(paid.data.map(invoiceLines))).flat()
  const counts = currentLines(lines, item)
    .filter((line) => !line.parent?.subscription_item_details?.proration || line.amount > 0)
    .map((line) => line.quantity ?? 0)
  return counts.length > 0 ? Math.max(...counts) : null
}

/**
 * Whether the subscription on the row has ended, asking Stripe when the row says it has not: that
 * subscription's own last event may still be on its way — a delivery that failed is retried later
 * — and until it lands the row's status is stale. Asked only when a different subscription
 * arrives, so a new plan is never held back by the order its events are delivered in.
 */
async function storedHasEnded(id: string, status: string | null): Promise<boolean> {
  if (hasSubscriptionEnded(status)) return true
  const stored = await stripeClient().subscriptions.retrieve(id)
  return hasSubscriptionEnded(stored.status)
}

/**
 * The Stripe Customer for a workspace, created on first use and remembered on the row — the one
 * writer of `stripe_customer_id`. Its `metadata.agency_id` names the workspace to anyone reading
 * the customer in the Stripe Dashboard; no code reads it — events find the workspace through the
 * subscription's own copy, which `createCheckoutSession` sets (src/lib/billing/checkout.ts). The
 * idempotency key means a retry after a lost row write finds the same customer rather than making
 * a second one.
 * `STRIPE_TEST_CLOCK`, test mode only, puts the customer under a test clock so a renewal can be
 * advanced in the end-to-end run.
 */
export async function ensureStripeCustomer(
  admin: AdminClient,
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
  revalidateTag('agencies', { expire: 0 })
  return customer.id
}

/**
 * Write what a subscription says onto its agency row — the ONE writer of the billing columns, never
 * of `plan` (`entitlementFor` derives it). Pass the subscription just re-fetched, never an event's
 * copy, so event order cannot matter. The row keeps its subscription until that one has ended; a
 * second open one is a `conflict`, nothing written — the customer is paying twice. On the row's
 * own subscription the period moves only on a `paidInvoice` for it (`paysCurrentPeriod`), or a
 * failed renewal would give the grace a fresh allowance. Two counts are written: the client slots
 * (`client_slots`, Stripe's quantity — the cap and the next renewal) on every snapshot, and the
 * count paid for (`paidQuantity`) only on a first fill or with a paid invoice, since a lower
 * refunds nothing and the period keeps what it paid for (docs/plans/CLIENT-SLOTS.md). A deleted
 * workspace yields a null agency id, which the event row's foreign key needs. The `{ expire: 0 }`
 * bust keeps Checkout's second-plan guard (`startCheckout`) current and, in a server action
 * (`setPlanEndingAction`, `setClientSlotsAction`), puts the re-rendered page into the action's
 * response, which `PlanEndControl` and the slot control rely on instead of a refresh.
 */
export async function applySubscriptionSnapshot(
  admin: AdminClient,
  subscription: Stripe.Subscription,
  paidInvoice?: Stripe.Invoice
): Promise<{
  agencyId: string | null
  outcome: 'started' | 'period_paid' | 'written' | 'ignored' | 'conflict' | 'no_workspace'
  detail?: string
  level?: 'error'
}> {
  const agencyId = subscription.metadata.agency_id
  if (!agencyId) return { agencyId: null, outcome: 'ignored' }

  const { data: row, error } = await admin
    .from('agencies')
    .select(AGENCY_SNAPSHOT_COLUMNS)
    .eq('id', agencyId)
    .maybeSingle()
  if (error) throw new Error(`agency read failed for ${agencyId}: ${error.message}`)
  if (!row) return { agencyId: null, outcome: 'no_workspace' }

  const isNew = row.stripe_subscription_id !== subscription.id
  if (isNew && hasSubscriptionEnded(subscription.status)) return { agencyId, outcome: 'ignored' }
  if (
    isNew &&
    row.stripe_subscription_id !== null &&
    !(await storedHasEnded(row.stripe_subscription_id, row.subscription_status))
  ) {
    return {
      agencyId,
      outcome: 'conflict',
      detail: `${subscription.id} arrived while ${row.stripe_subscription_id} is open; nothing written`,
      level: 'error',
    }
  }

  const { item, slots, period } = slotItemOf(subscription)
  const since = isNew ? null : row.past_due_since
  const update: AgencyUpdate = {
    subscription_status: subscription.status,
    stripe_subscription_id: subscription.id,
    cancel_at_period_end: subscription.cancel_at_period_end,
    past_due_since: subscription.status === 'past_due' ? (since ?? new Date().toISOString()) : null,
  }
  const periodPaid = !!paidInvoice && paysCurrentPeriod(await invoiceLines(paidInvoice), item)
  if (isNew || periodPaid) {
    update.current_period_start = period.start.toISOString()
    update.current_period_end = period.end.toISOString()
  }
  update.client_slots = slots
  if (isNew) update.subscription_quantity = slots
  if (!isNew && paidInvoice) {
    const paid = await paidQuantity(subscription.id, item)
    if (paid !== null) update.subscription_quantity = paid
  }

  const { error: writeError } = await admin.from('agencies').update(update).eq('id', agencyId)
  if (writeError) throw new Error(`snapshot write failed for ${agencyId}: ${writeError.message}`)
  revalidateTag('agencies', { expire: 0 })
  return { agencyId, outcome: isNew ? 'started' : periodPaid ? 'period_paid' : 'written' }
}

/**
 * End the workspace's plan, or keep it after all — from inside the app; Stripe's portal is for the
 * card, the address and the tax ID only. Decided on Stripe's live status, which the row can lag: a
 * subscription whose renewal failed (`hasPaymentFailed`) is cancelled at once, since ending it at
 * the period end would leave that renewal open and still collected; any other ends at its period
 * end. Stripe's answer is written through `applySubscriptionSnapshot` before the webhook's copy
 * arrives; `endedNow` says which way it went.
 */
export async function setPlanEnding(
  admin: AdminClient,
  subscriptionId: string,
  ending: boolean
): Promise<{ endedNow: boolean }> {
  const stripe = stripeClient()
  const endedNow =
    ending && hasPaymentFailed((await stripe.subscriptions.retrieve(subscriptionId)).status)
  const subscription = endedNow
    ? await stripe.subscriptions.cancel(subscriptionId)
    : await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: ending })
  await applySubscriptionSnapshot(admin, subscription)
  return { endedNow }
}

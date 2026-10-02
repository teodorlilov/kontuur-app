'use server'

import 'server-only'
import { resolveActionAuth } from '@/lib/auth/helpers'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getCachedAgency, getCachedEntitlement } from '@/lib/queries/cache'
import { countClientsByAgency, fetchAgencyById } from '@/lib/queries/db'
import { createCheckoutSession, createPortalSession } from '@/lib/billing/checkout'
import { SlotChangeError, SlotSnapshotError, setClientSlots } from '@/lib/billing/client-slots'
import { entitlementFor, type Entitlement } from '@/lib/billing/entitlement'
import { MAX_CLIENT_SLOTS, billableQuantity } from '@/lib/billing/plans'
import { ensureStripeCustomer, setPlanEnding } from '@/lib/billing/subscription-store'
import {
  BILLING_ADMINS_ONLY,
  NO_BILLING_ACCOUNT,
  NO_PLAN_TO_CANCEL,
  NO_PLAN_TO_KEEP,
  PLAN_ACTIVATING,
  PLAN_ALREADY_ACTIVE,
  SLOTS_INVALID,
  SLOTS_NEED_PLAN,
  SLOTS_PAGE_STALE,
  SLOTS_SOLO,
  SLOTS_TOO_MANY,
  STRIPE_UNAVAILABLE,
  slotsBelowClients,
  slotsUnavailable,
  type SlotChangeOutcome,
} from '@/lib/billing/copy'
import {
  clientSlotsSchema,
  setPlanEndingSchema,
  slotChangeSchema,
  type SlotChangeInput,
} from '@/features/settings/schemas'
import type { ActionResult } from '@/lib/actions/types'

type Url = ActionResult<{ url: string }>

/**
 * What an admin can do to the subscription — each auth, one rule, one call into
 * `src/lib/billing/`. Admin-only on the cached role `resolveActionAuth` returns — no second users
 * read. A Stripe failure is logged at this boundary and the person gets one sentence, not the
 * SDK's.
 */
async function adminAuth() {
  const auth = await resolveActionAuth()
  if (!auth.ok) return auth
  if (auth.role !== 'admin') return { ok: false as const, error: BILLING_ADMINS_ONLY }
  return auth
}

/**
 * Why a slot count is refused, or null: never below the clients the workspace has
 * (`billableQuantity`), never above `MAX_CLIENT_SLOTS` on a raise — a larger count set by hand in
 * Stripe can always be lowered — and exactly one business on a solo workspace. One rule for
 * Checkout's number and for a change.
 */
function slotCountRefusal(
  mode: 'agency' | 'solo',
  slots: number,
  clientCount: number,
  raising: boolean
): string | null {
  if (mode === 'solo' && slots !== 1) return SLOTS_SOLO
  if (slots < billableQuantity(clientCount)) return slotsBelowClients(clientCount)
  if (raising && slots > MAX_CLIENT_SLOTS) return SLOTS_TOO_MANY
  return null
}

/**
 * Send the admin to Checkout for the one plan, for the client slots they chose (`slotCountRefusal`
 * bounds it). Refused on house and while a subscription is open in any state — a locked workspace
 * whose renewal failed updates its card or cancels instead, since a second subscription would
 * charge twice. The row may not show a subscription Stripe already holds, so
 * `createCheckoutSession` asks Stripe too. `getCachedAgency` and `getCachedEntitlement` are one
 * read, which the Stripe snapshot's `{ expire: 0 }` bust keeps current.
 */
export async function startCheckout(slots: number): Promise<Url> {
  const auth = await adminAuth()
  if (!auth.ok) return auth
  const { supabase, agencyId } = auth
  const parsed = clientSlotsSchema.safeParse(slots)
  if (!parsed.success) return { ok: false, error: SLOTS_INVALID }

  const [agency, entitlement] = await Promise.all([
    getCachedAgency(agencyId),
    getCachedEntitlement(agencyId),
  ])
  if (!agency) return { ok: false, error: 'Workspace not found' }
  if (entitlement.plan === 'house' || entitlement.subscriptionOpen) {
    return { ok: false, error: PLAN_ALREADY_ACTIVE }
  }

  try {
    const clients = await countClientsByAgency(supabase, agencyId)
    const refusal = slotCountRefusal(entitlement.mode, parsed.data, clients, true)
    if (refusal) return { ok: false, error: refusal }
    const customerId = await ensureStripeCustomer(createAdminSupabaseClient(), agency)
    const url = await createCheckoutSession({ customerId, agencyId, quantity: parsed.data })
    if (!url) return { ok: false, error: PLAN_ACTIVATING }
    return { ok: true, data: { url } }
  } catch (err) {
    console.error(`[billing:checkout] failed for ${agencyId}:`, err)
    return { ok: false, error: STRIPE_UNAVAILABLE }
  }
}

/** Send the admin to Stripe's portal for the card, the address and the tax ID — never to cancel. */
export async function openBillingPortal(): Promise<Url> {
  const auth = await adminAuth()
  if (!auth.ok) return auth
  const { agencyId } = auth

  const agency = await getCachedAgency(agencyId)
  if (!agency?.stripe_customer_id) return { ok: false, error: NO_BILLING_ACCOUNT }

  try {
    return { ok: true, data: { url: await createPortalSession(agency.stripe_customer_id) } }
  } catch (err) {
    console.error(`[billing:portal] failed for ${agencyId}:`, err)
    return { ok: false, error: STRIPE_UNAVAILABLE }
  }
}

/**
 * End the plan, or keep it after all — from inside the app, never the portal. Reads the row
 * uncached, like the settings page: the answer to "is it already ending" must be seconds fresh.
 * Cancelling wants an open plan not yet set to end (`Entitlement.planEnding`, which a failed
 * renewal never is, so its plan can always be cancelled); keeping wants one that is. Whether the
 * cancel ends the plan now or at its period end is `setPlanEnding`'s decision, on Stripe's live
 * status, and `endedNow` tells the page which happened. The read sits inside the boundary's try,
 * so a failed one is logged once and answered, never left to hang the button.
 */
export async function setPlanEndingAction(
  ending: boolean
): Promise<ActionResult<{ endedNow: boolean }>> {
  const auth = await adminAuth()
  if (!auth.ok) return auth
  const { supabase, agencyId } = auth

  const parsed = setPlanEndingSchema.safeParse(ending)
  if (!parsed.success) return { ok: false, error: NO_PLAN_TO_CANCEL }

  try {
    const agency = await fetchAgencyById(supabase, agencyId)
    if (!agency?.stripe_subscription_id) return { ok: false, error: NO_PLAN_TO_CANCEL }
    const entitlement = entitlementFor(agency, new Date())
    if (parsed.data && entitlement.canDelete) return { ok: false, error: NO_PLAN_TO_CANCEL }
    if (!parsed.data && !entitlement.planEnding) return { ok: false, error: NO_PLAN_TO_KEEP }
    const ended = await setPlanEnding(
      createAdminSupabaseClient(),
      agency.stripe_subscription_id,
      parsed.data
    )
    return { ok: true, data: ended }
  } catch (err) {
    console.error(`[billing:plan-ending] failed for ${agencyId}:`, err)
    return { ok: false, error: STRIPE_UNAVAILABLE }
  }
}

/**
 * Why a slot change is refused on the fresh row's entitlement, or null: a plan that cannot change
 * now (`slotsUnavailable`), a confirm priced on a period that has since renewed (`rowPeriodStart`
 * is `agencies.current_period_start`), or a count outside `slotCountRefusal`'s bounds.
 */
function slotChangeRefusal(
  entitlement: Entitlement,
  rowPeriodStart: string | null,
  input: SlotChangeInput,
  clientCount: number,
  now: Date
): string | null {
  const unavailable = slotsUnavailable(entitlement, now)
  if (unavailable) return unavailable
  if (Date.parse(input.periodStart) !== Date.parse(rowPeriodStart ?? '')) return SLOTS_PAGE_STALE
  return slotCountRefusal(entitlement.mode, input.to, clientCount, input.to > input.from)
}

/**
 * Change the client slots, from the count the admin saw (`from`) to the one they chose (`to`).
 * Reads the row uncached, like `setPlanEndingAction`, and counts the clients, so the refusals
 * (`slotChangeRefusal`) judge this moment rather than the page's. What Stripe is asked and what it
 * charges is `setClientSlots`' (src/lib/billing/client-slots.ts); its outcome words the toast. A
 * refusal or a declined card is the person's sentence, logged as a warning; a change Stripe made
 * whose row could not be written is reported as made, since the webhook writes the row; anything
 * else is logged and answered as Stripe being unavailable.
 */
export async function setClientSlotsAction(
  input: SlotChangeInput
): Promise<ActionResult<{ outcome: SlotChangeOutcome }>> {
  const auth = await adminAuth()
  if (!auth.ok) return auth
  const { supabase, agencyId } = auth
  const parsed = slotChangeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: SLOTS_INVALID }
  const { from, to, periodStart } = parsed.data

  try {
    const [agency, clients] = await Promise.all([
      fetchAgencyById(supabase, agencyId),
      countClientsByAgency(supabase, agencyId),
    ])
    if (!agency?.stripe_subscription_id) return { ok: false, error: SLOTS_NEED_PLAN }
    const now = new Date()
    const entitlement = entitlementFor(agency, now)
    const refusal = slotChangeRefusal(
      entitlement,
      agency.current_period_start,
      parsed.data,
      clients,
      now
    )
    if (refusal) return { ok: false, error: refusal }
    const outcome = await setClientSlots(
      createAdminSupabaseClient(),
      agencyId,
      agency.stripe_subscription_id,
      { from, to, paid: entitlement.brandsPaid, periodStart }
    )
    return { ok: true, data: { outcome } }
  } catch (err) {
    if (err instanceof SlotChangeError) {
      console.warn(`[billing:slots] refused for ${agencyId}:`, err.message)
      return { ok: false, error: err.message }
    }
    if (err instanceof SlotSnapshotError) {
      console.error(`[billing:slots] changed for ${agencyId}, row not written:`, err.cause)
      return { ok: true, data: { outcome: err.outcome } }
    }
    console.error(`[billing:slots] failed for ${agencyId}:`, err)
    return { ok: false, error: STRIPE_UNAVAILABLE }
  }
}

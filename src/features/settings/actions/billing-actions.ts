'use server'

import 'server-only'
import { resolveActionAuth } from '@/lib/auth/helpers'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getCachedAgency, getCachedEntitlement } from '@/lib/queries/cache'
import { countClientsByAgency, fetchAgencyById } from '@/lib/queries/db'
import { createCheckoutSession, createPortalSession } from '@/lib/billing/checkout'
import { entitlementFor } from '@/lib/billing/entitlement'
import { billableQuantity } from '@/lib/billing/plans'
import { ensureStripeCustomer, setPlanEnding } from '@/lib/billing/subscription-store'
import {
  BILLING_ADMINS_ONLY,
  NO_BILLING_ACCOUNT,
  NO_PLAN_TO_CANCEL,
  NO_PLAN_TO_KEEP,
  PLAN_ACTIVATING,
  PLAN_ALREADY_ACTIVE,
  STRIPE_UNAVAILABLE,
} from '@/lib/billing/copy'
import { setPlanEndingSchema } from '@/features/settings/schemas'
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
 * Send the admin to Checkout for the one plan, billed for the workspace's clients
 * (`billableQuantity`). Refused on house and while a subscription is open in any state — a
 * locked workspace whose renewal failed updates its card or cancels instead, since a second
 * subscription would charge twice. The row may not show a subscription Stripe already holds, so
 * `createCheckoutSession` asks Stripe too. `getCachedAgency` and `getCachedEntitlement` are one
 * read, which the Stripe snapshot's `{ expire: 0 }` bust keeps current.
 */
export async function startCheckout(): Promise<Url> {
  const auth = await adminAuth()
  if (!auth.ok) return auth
  const { supabase, agencyId } = auth

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
    const customerId = await ensureStripeCustomer(createAdminSupabaseClient(), agency)
    const url = await createCheckoutSession({
      customerId,
      agencyId,
      quantity: billableQuantity(clients),
    })
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
 * status, and `endedNow` tells the page which happened.
 */
export async function setPlanEndingAction(
  ending: boolean
): Promise<ActionResult<{ endedNow: boolean }>> {
  const auth = await adminAuth()
  if (!auth.ok) return auth
  const { supabase, agencyId } = auth

  const parsed = setPlanEndingSchema.safeParse(ending)
  if (!parsed.success) return { ok: false, error: NO_PLAN_TO_CANCEL }

  const agency = await fetchAgencyById(supabase, agencyId)
  if (!agency?.stripe_subscription_id) return { ok: false, error: NO_PLAN_TO_CANCEL }
  const entitlement = entitlementFor(agency, new Date())
  if (parsed.data && entitlement.canDelete) return { ok: false, error: NO_PLAN_TO_CANCEL }
  if (!parsed.data && !entitlement.planEnding) return { ok: false, error: NO_PLAN_TO_KEEP }

  try {
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

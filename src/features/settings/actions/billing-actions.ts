'use server'

import 'server-only'
import { resolveActionAuth } from '@/lib/auth/helpers'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getCachedAgency, getCachedEntitlement } from '@/lib/queries/cache'
import { countClientsByAgency } from '@/lib/queries/db'
import { createCheckoutSession, createPortalSession } from '@/lib/billing/checkout'
import { ensureStripeCustomer } from '@/lib/billing/subscription-store'
import {
  BILLING_ADMINS_ONLY,
  NO_BILLING_ACCOUNT,
  PLAN_ALREADY_ACTIVE,
  STRIPE_UNAVAILABLE,
} from '@/lib/billing/copy'
import type { ActionResult } from '@/lib/actions/types'

type Url = ActionResult<{ url: string }>

/**
 * The two things an admin can do to the subscription, each auth, one rule, one call into
 * `src/lib/billing/checkout.ts`. Admin-only on the cached role `resolveActionAuth` returns — no
 * second users read. Neither takes input, so there is no body to validate. A Stripe failure is
 * logged at this boundary and the person gets one sentence, not the SDK's.
 */
async function adminAuth() {
  const auth = await resolveActionAuth()
  if (!auth.ok) return auth
  if (auth.role !== 'admin') return { ok: false as const, error: BILLING_ADMINS_ONLY }
  return auth
}

/**
 * Send the admin to Checkout for the one plan, with the workspace's client count as the
 * quantity. Refused while a plan is already live — the portal is the way then. `getCachedAgency`
 * and `getCachedEntitlement` are one read: the entitlement is derived from that row.
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
  if (
    entitlement.plan === 'house' ||
    entitlement.state === 'active' ||
    entitlement.state === 'past_due'
  ) {
    return { ok: false, error: PLAN_ALREADY_ACTIVE }
  }

  try {
    const clients = await countClientsByAgency(supabase, agencyId)
    const customerId = await ensureStripeCustomer(createAdminSupabaseClient(), agency)
    const url = await createCheckoutSession({
      customerId,
      agencyId,
      quantity: Math.max(1, clients),
    })
    return { ok: true, data: { url } }
  } catch (err) {
    console.error(`[billing:checkout] failed for ${agencyId}:`, err)
    return { ok: false, error: STRIPE_UNAVAILABLE }
  }
}

/** Send the admin to Stripe's portal for the card, the address, the tax ID and cancellation. */
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

import 'server-only'

import { PLAN_AND_BILLING_PATH } from '@/utils/constants'
import { resolveAppUrl } from '@/utils/url'
import { CHECKOUT_CONSENT } from './copy'
import { hasSubscriptionEnded } from './entitlement'
import { stripeClient, verifiedPriceId } from './stripe'

function planPageUrl(outcome?: 'success' | 'cancelled'): string {
  const base = `${resolveAppUrl()}${PLAN_AND_BILLING_PATH}`
  return outcome ? `${base}&billing=${outcome}` : base
}

/**
 * The hosted Checkout for the one plan, and the URL to send the admin to — or null when Stripe
 * already holds a subscription for this customer that has not ended (`hasSubscriptionEnded`): the
 * webhook is still on its way, or a second tab paid first. The customer's other open sessions are
 * expired first, so only the newest tab can pay; a failed expire throws, since the old session
 * could still be paid beside the new one — but only after that check, since a session paid
 * meanwhile cannot be expired and is found as its subscription instead.
 *
 * Cards only (the Н-18 alternative regime is card payments alone); the billing address is required
 * and a business tax ID optional (consumers are customers), both saved onto the Customer so
 * renewals are taxed against the same address; no deferred trial end, so the subscription is active
 * from its first event; `agency_id` on its metadata is how every webhook finds the workspace, and
 * the webhook, never the success URL, provisions.
 */
export async function createCheckoutSession(input: {
  customerId: string
  agencyId: string
  quantity: number
}): Promise<string | null> {
  const stripe = stripeClient()
  const [priceId, openSessions] = await Promise.all([
    verifiedPriceId(),
    stripe.checkout.sessions.list({ customer: input.customerId, status: 'open', limit: 100 }),
  ])
  const expiries = await Promise.allSettled(
    openSessions.data.map((session) => stripe.checkout.sessions.expire(session.id))
  )
  const subscriptions = await stripe.subscriptions.list({ customer: input.customerId, limit: 100 })
  if (subscriptions.data.some((subscription) => !hasSubscriptionEnded(subscription.status))) {
    return null
  }
  const failedExpiry = expiries.find((expiry) => expiry.status === 'rejected')
  if (failedExpiry) throw failedExpiry.reason

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: input.customerId,
    line_items: [{ price: priceId, quantity: input.quantity }],
    payment_method_types: ['card'],
    automatic_tax: { enabled: true },
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    customer_update: { address: 'auto', name: 'auto' },
    consent_collection: { terms_of_service: 'required' },
    custom_text: { terms_of_service_acceptance: { message: CHECKOUT_CONSENT } },
    locale: 'auto',
    subscription_data: { metadata: { agency_id: input.agencyId } },
    success_url: planPageUrl('success'),
    cancel_url: planPageUrl('cancelled'),
  })
  if (!session.url) throw new Error('Checkout session came back without a url')
  return session.url
}

/**
 * Stripe's customer portal, configured by hand in the Dashboard for the card, the address and the
 * tax ID only — cancellation is switched off there, since a plan ends from inside the app
 * (`setPlanEnding`, src/lib/billing/subscription-store.ts).
 */
export async function createPortalSession(customerId: string): Promise<string> {
  const session = await stripeClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: planPageUrl(),
  })
  return session.url
}

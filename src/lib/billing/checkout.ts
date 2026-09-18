import 'server-only'

import { PLAN_AND_BILLING_PATH } from '@/utils/constants'
import { resolveAppUrl } from '@/utils/url'
import { CHECKOUT_CONSENT } from './copy'
import { stripeClient, stripePriceId } from './stripe'

function planPageUrl(outcome?: 'success' | 'cancelled'): string {
  const base = `${resolveAppUrl()}${PLAN_AND_BILLING_PATH}`
  return outcome ? `${base}&billing=${outcome}` : base
}

/**
 * The hosted Checkout for the one plan, and the URL to send the admin to. Cards only, because
 * the Н-18 alternative regime is card payments and nothing else; the billing address is required
 * and a business tax ID optional (consumers are customers), both saved back onto the Customer so
 * renewals are taxed against the same address; Stripe Tax on; the consent tick; `agency_id` on
 * the subscription's metadata, which is how every later webhook finds the workspace. No deferred
 * trial end: the first charge is immediate, so the subscription is active from its first event.
 * Nothing is provisioned from the success URL — the webhook does that.
 */
export async function createCheckoutSession(input: {
  customerId: string
  agencyId: string
  quantity: number
}): Promise<string> {
  const session = await stripeClient().checkout.sessions.create({
    mode: 'subscription',
    customer: input.customerId,
    line_items: [{ price: stripePriceId(), quantity: input.quantity }],
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

/** Stripe's customer portal — card, address, tax ID, cancel at period end — configured by hand in the Dashboard. */
export async function createPortalSession(customerId: string): Promise<string> {
  const session = await stripeClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: planPageUrl(),
  })
  return session.url
}

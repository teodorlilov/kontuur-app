import 'server-only'

import { graphGet } from '@/lib/meta/graph-client'
import { IG_GRAPH_BASE, IG_OAUTH_TOKEN_URL, IG_TOKEN_EXCHANGE_URL } from '@/lib/meta/constants'
import {
  igShortLivedTokenSchema,
  igShortLivedWrappedSchema,
  igLongLivedTokenSchema,
  igUserSchema,
  type IGShortLivedToken,
  type IGLongLivedToken,
} from '@/lib/meta/schemas'

/**
 * Instagram Business Login's half of the connect flow: code → long-lived token → the account
 * it names.
 *
 * Kept out of the callback route for the same reason `facebook-auth.ts` is: the route composes,
 * it does not implement — and the two networks' exchanges share nothing but their shape
 * (different app credentials, different hosts, POST form against GET query). The route lived
 * with this half written into it long after Facebook's half moved out, which is the asymmetry
 * this file closes.
 *
 * Nothing here writes. The connection is recorded by `storeConnection`, the one writer of that
 * operation for every connect flow.
 */

/** Swap the consent code for a short-lived token naming the Instagram user. */
export async function exchangeInstagramCode(
  code: string,
  redirectUri: string
): Promise<IGShortLivedToken> {
  const body = new URLSearchParams()
  body.set('client_id', process.env.META_INSTAGRAM_APP_ID!)
  body.set('client_secret', process.env.META_INSTAGRAM_APP_SECRET!)
  body.set('grant_type', 'authorization_code')
  body.set('redirect_uri', redirectUri)
  body.set('code', code)

  const res = await fetch(IG_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Instagram token exchange failed: ${err}`)
  }

  // Business Login wraps the token in a data array ({"data":[{access_token,...}]});
  // the legacy flat shape ({access_token,...}) still appears on some responses —
  // the schema accepts both, and we fail loudly with the raw body so shape drift
  // stays debuggable.
  const raw: unknown = await res.json()
  const wrapped = igShortLivedWrappedSchema.safeParse(raw)
  if (wrapped.success) {
    const token = wrapped.data.data[0]!
    return { access_token: token.access_token, user_id: token.user_id }
  }

  const flat = igShortLivedTokenSchema.safeParse(raw)
  if (!flat.success) {
    throw new Error(
      `Instagram token exchange returned no access_token: ${JSON.stringify(raw).slice(0, 300)}`
    )
  }
  return { access_token: flat.data.access_token, user_id: flat.data.user_id }
}

/** Upgrade to a long-lived token (~60 days); the refresh cron keeps it alive from there. */
export async function exchangeInstagramForLongLived(
  shortLivedToken: string
): Promise<IGLongLivedToken> {
  // Guard: an empty token turns this GET into an unroutable request and Graph
  // answers with the misleading "Unsupported request - method type: get"
  if (!shortLivedToken) {
    throw new Error('Instagram long-lived exchange called without a short-lived token')
  }

  const params = new URLSearchParams()
  params.set('grant_type', 'ig_exchange_token')
  params.set('client_secret', process.env.META_INSTAGRAM_APP_SECRET!)
  params.set('access_token', shortLivedToken)

  // Documented form: unversioned GET only. Note: this call is refused with
  // "Unsupported request" for tokens minted off grants the app is not yet
  // entitled to serve (e.g. other businesses' accounts before Meta Access
  // Verification) — that is an entitlement problem, not a request-shape one.
  const res = await fetch(`${IG_TOKEN_EXCHANGE_URL}?${params.toString()}`)
  if (!res.ok) {
    const err = await res.text()
    // Token length/prefix only — never the token itself
    throw new Error(
      `Instagram long-lived token exchange failed (token len=${shortLivedToken.length}, prefix=${shortLivedToken.slice(0, 4)}): ${err.slice(0, 300)}`
    )
  }
  const result = igLongLivedTokenSchema.safeParse(await res.json())
  if (!result.success) {
    throw new Error('Instagram long-lived token exchange returned no access_token')
  }
  return result.data
}

/** Who the token names — mirrors `fetchFacebookUser`, through the shared header-auth client. */
export function fetchInstagramUser(
  longLivedToken: string
): Promise<{ id: string; username?: string; name?: string }> {
  return graphGet(igUserSchema, `${IG_GRAPH_BASE}/me`, longLivedToken, {
    fields: 'id,username,name',
  })
}

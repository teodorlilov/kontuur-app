import 'server-only'

import { FB_GRAPH_BASE, FB_OAUTH_TOKEN_URL } from '@/lib/meta/constants'
import { fbPagesResponseSchema, fbTokenSchema, fbUserSchema } from '@/lib/meta/schemas'

/**
 * Facebook Login's half of the connect flow: code → user token → the Pages that token can reach.
 *
 * Kept out of the callback route, and away from Instagram's exchange, because the two share
 * nothing but their shape — different app credentials, different host, different token lifetime.
 * The last integration put both in one branch and it is why "add a network" meant editing every
 * layer.
 *
 * Nothing here writes. The connection is recorded by `storeConnection`, which is the one writer
 * of that operation for all three flows.
 */

/** A Page the connecting user administers, with the token that acts as it. */
export interface FacebookPage {
  id: string
  name: string
  accessToken: string
  category: string | null
  /** What this person may do with the Page. Publishing needs CREATE_CONTENT. */
  tasks: string[]
}

async function tokenExchange(params: Record<string, string>, label: string): Promise<string> {
  const url = new URL(FB_OAUTH_TOKEN_URL)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

  const res = await fetch(url.toString())
  const raw: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    // The raw envelope travels with the failure: Graph says why in `error.message`, and a
    // generic "exchange failed" is what makes a scope or redirect-uri mismatch unreadable.
    throw new Error(`Facebook ${label} failed: ${JSON.stringify(raw).slice(0, 300)}`)
  }
  const parsed = fbTokenSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(
      `Facebook ${label} returned no access_token: ${JSON.stringify(raw).slice(0, 300)}`
    )
  }
  return parsed.data.access_token
}

/** Swap the consent code for a short-lived user token. */
export function exchangeFacebookCode(code: string, redirectUri: string): Promise<string> {
  return tokenExchange(
    {
      client_id: process.env.META_APP_ID ?? '',
      client_secret: process.env.META_APP_SECRET ?? '',
      redirect_uri: redirectUri,
      code,
    },
    'token exchange'
  )
}

/**
 * Upgrade to a long-lived user token (~60 days).
 *
 * The Page tokens derived from it are what the app actually publishes with, and those do not
 * expire while this one lives — which is why a Page connection stores a null expiry rather than
 * a date it would have to guess.
 */
export function exchangeFacebookForLongLived(shortLivedToken: string): Promise<string> {
  return tokenExchange(
    {
      grant_type: 'fb_exchange_token',
      client_id: process.env.META_APP_ID ?? '',
      client_secret: process.env.META_APP_SECRET ?? '',
      fb_exchange_token: shortLivedToken,
    },
    'long-lived token exchange'
  )
}

async function graphGet(path: string, accessToken: string, label: string): Promise<unknown> {
  const url = new URL(`${FB_GRAPH_BASE}/${path}`)
  url.searchParams.set('access_token', accessToken)
  const res = await fetch(url.toString())
  const raw: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`Facebook ${label} failed: ${JSON.stringify(raw).slice(0, 300)}`)
  return raw
}

/** Who consented — stored on the user-scoped row so the Page chooser can say whose Pages these are. */
export async function fetchFacebookUser(
  accessToken: string
): Promise<{ id: string; name: string }> {
  const raw = await graphGet('me?fields=id,name', accessToken, 'user lookup')
  const parsed = fbUserSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`Facebook user lookup returned no id: ${JSON.stringify(raw).slice(0, 300)}`)
  }
  return { id: parsed.data.id, name: parsed.data.name ?? parsed.data.id }
}

/**
 * The Pages this user administers.
 *
 * Unlike Instagram, consent does not decide which account is connected — a person may administer
 * several Pages and has to pick. That is why the Facebook flow stores a user token first and
 * connects a Page second.
 */
export async function fetchFacebookPages(accessToken: string): Promise<FacebookPage[]> {
  const raw = await graphGet('me/accounts', accessToken, 'page list')
  const parsed = fbPagesResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`Facebook page list was not readable: ${JSON.stringify(raw).slice(0, 300)}`)
  }
  return parsed.data.data.map((page) => ({
    id: page.id,
    name: page.name,
    accessToken: page.access_token,
    category: page.category ?? null,
    tasks: page.tasks ?? [],
  }))
}

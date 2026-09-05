import 'server-only'

import type { z } from 'zod'

import { FB_GRAPH_BASE, FB_OAUTH_TOKEN_URL } from '@/lib/meta/constants'
import { graphGet } from '@/lib/meta/graph-client'
import {
  fbDebugTokenSchema,
  fbPageSchema,
  fbPagesResponseSchema,
  fbTokenSchema,
  fbUserSchema,
} from '@/lib/meta/schemas'

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

/** A Page the connecting user granted this app, with the token that acts as it. */
export interface FacebookPage {
  id: string
  name: string
  accessToken: string
  category: string | null
  /** Whether this app may publish to the Page. Decided by `canPublishTo`, never re-derived. */
  canPublish: boolean
}

/** The task a Page role needs before it can post. Only `/me/accounts` reports these. */
const CREATE_CONTENT = 'CREATE_CONTENT'

/** Scope → the Page ids it covers, `null` when it covers all of them, absent when not granted. */
type GranularScopes = Map<string, string[] | null>

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

/** Who consented — stored on the user-scoped row so the Page chooser can say whose Pages these are. */
export async function fetchFacebookUser(
  accessToken: string
): Promise<{ id: string; name: string }> {
  const user = await graphGet(fbUserSchema, `${FB_GRAPH_BASE}/me`, accessToken, {
    fields: 'id,name',
  })
  return { id: user.id, name: user.name ?? user.id }
}

/**
 * What this token was granted, per Page.
 *
 * Requires the app token rather than the user's, so it is a server-only question — which this
 * module already is.
 *
 * Returns NULL when the record cannot be read at all, which is a different answer from a record
 * that grants nothing. Collapsing the two would make a Page the person actively declined look
 * identical to one whose grant we simply could not fetch — and `canPublishTo` treats those
 * opposite ways round on purpose.
 */
async function fetchGranularScopes(accessToken: string): Promise<GranularScopes | null> {
  const appToken = `${process.env.META_APP_ID ?? ''}|${process.env.META_APP_SECRET ?? ''}`
  let debugged: z.infer<typeof fbDebugTokenSchema>
  try {
    // The APP token is the caller here, so it rides in the Authorization header like every
    // other Graph call — the token being inspected is the query parameter.
    debugged = await graphGet(fbDebugTokenSchema, `${FB_GRAPH_BASE}/debug_token`, appToken, {
      input_token: accessToken,
    })
  } catch (err) {
    // Not fatal, and not silent: `/me/accounts` can still list Pages without this, so the list
    // degrades to what that edge offers rather than failing outright.
    console.warn('[facebook] could not inspect token grants:', err)
    return null
  }
  const scopes: GranularScopes = new Map()
  for (const entry of debugged.data.granular_scopes ?? []) {
    scopes.set(entry.scope, entry.target_ids ?? null)
  }
  return scopes
}

/** One Page read by id, or null when this token cannot see it. */
async function fetchPageById(
  id: string,
  accessToken: string
): Promise<z.infer<typeof fbPageSchema> | null> {
  try {
    return await graphGet(fbPageSchema, `${FB_GRAPH_BASE}/${id}`, accessToken, {
      fields: 'id,name,access_token,category',
    })
  } catch {
    // A Page named in a grant that will not load is not an error worth failing the whole list
    // for — the other Pages are still connectable, and a Page that cannot be read cannot be
    // published to either.
    return null
  }
}

/**
 * The Pages this user granted the app, and whether each can be published to.
 *
 * Unlike Instagram, consent does not decide which account is connected — a person may administer
 * several Pages and has to pick. That is why the Facebook flow stores a user token first and
 * connects a Page second.
 *
 * **`/me/accounts` alone is not the answer, and that is not a guess.** With a Page explicitly
 * ticked in Facebook's asset picker and `pages_show_list` reporting granted, that edge returned
 * `{"data":[]}` while `/debug_token` named the very same Page under
 * `granular_scopes.pages_show_list.target_ids` — and reading it by id returned a working Page
 * token that published-posts and feed both accepted.
 *
 * That is documented, not a fault: since v17.0 the edge omits any Page linked to a Meta business
 * account unless the caller granted `business_management` AND holds a role on that particular
 * business. A grant for a DIFFERENT business satisfies neither half, and Graph says nothing —
 * the Page is simply absent from a 200. Recorded in `docs/META-FB-PROBE.md`.
 *
 * So the grant is the source of truth and the edge is the convenience: whatever `/me/accounts`
 * offers is kept, anything the grant names on top of it is recovered by id, and the two are
 * merged on id so a Page that appears in both is listed once.
 */
export async function fetchFacebookPages(accessToken: string): Promise<FacebookPage[]> {
  const [scopes, accounts] = await Promise.all([
    fetchGranularScopes(accessToken),
    graphGet(fbPagesResponseSchema, `${FB_GRAPH_BASE}/me/accounts`, accessToken),
  ])

  const listed = accounts.data
  const seen = new Set(listed.map((page) => page.id))
  // An unreadable grant recovers nothing extra — `/me/accounts` is then the whole answer.
  const granted = scopes?.get('pages_show_list') ?? []
  const recovered = await Promise.all(
    granted.filter((id) => !seen.has(id)).map((id) => fetchPageById(id, accessToken))
  )

  // Both halves are already schema-parsed by the shared client, so there is nothing left to
  // validate here — only the rename into this module's vocabulary.
  return [...listed, ...recovered.filter((page) => page !== null)].map((page) => ({
    id: page.id,
    name: page.name,
    accessToken: page.access_token,
    category: page.category ?? null,
    canPublish: canPublishTo(page.id, page.tasks, scopes),
  }))
}

/**
 * Whether the app may post to one Page.
 *
 * Three states, not two, and the middle one is the reason this takes the whole grant rather
 * than one scope's entry:
 *
 * - The grant is UNREADABLE (`null`): fall back to `tasks`, what the person may do themselves.
 * - The grant is readable and `pages_manage_posts` is ABSENT: they declined it for every Page.
 *   That is an answer, and it is no — falling back to `tasks` here would let a Page the person
 *   refused this app read as publishable.
 * - The grant covers the Page: yes. An absent `target_ids` (`null`) means every Page, the shape
 *   "opt in to all current and future Pages" produces.
 *
 * One question, one function, so the chooser and the publish path cannot answer it differently.
 */
function canPublishTo(
  id: string,
  tasks: string[] | undefined,
  grant: GranularScopes | null
): boolean {
  if (!grant) return (tasks ?? []).includes(CREATE_CONTENT)
  const publishable = grant.get('pages_manage_posts')
  if (publishable === undefined) return false
  return publishable === null || publishable.includes(id)
}

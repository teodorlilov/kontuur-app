import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { headers } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { AUTH_USER_ID_HEADER } from '@/lib/auth/headers'
import { USER_AUTH_COLUMNS } from '@/lib/queries/select-columns'

export type SupabaseServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

/** Cache tag for a user's agency and role. Bust it whenever either changes. */
export const USER_RECORD_TAG = 'user-record'

/**
 * The user's agency and role — ONE cached view of that row, for pages and routes alike.
 *
 * There were two. Routes resolved `agency_id` through a second `unstable_cache` tagged
 * `user-agency`, which NOTHING in the app ever revalidated: the only three mentions of that tag were
 * its own declaration and a comment telling the reader to bust it. So removing a team member busted
 * `user-record` — which the server-component path reads — while every API route kept resolving that
 * user to the agency they had just been removed from, for up to five more minutes. A stale query is
 * a performance problem; a stale `agency_id` is an access-control one.
 *
 * `unstable_cache` for the cross-request TTL, wrapped in React `cache` so a layout and its page
 * share one read within a render. The admin client is required inside `unstable_cache` — a
 * request-scoped client cannot be captured by a cross-request cache.
 */
const _fetchUserRecord = unstable_cache(
  async (userId: string) => getUserRecord(createAdminSupabaseClient(), userId),
  ['user-record'],
  { revalidate: 300, tags: [USER_RECORD_TAG] }
)

export const getCachedUserRecord = cache(_fetchUserRecord)

/**
 * Authenticate the current user and resolve their agency_id.
 * Throws AuthError on failure so routes can catch and return the appropriate HTTP status.
 *
 * getClaims, not getUser: API routes are excluded from the middleware matcher, so they must
 * verify the JWT themselves — but the project signs with ES256, so verification is local
 * against the cached JWKS instead of a round trip to the auth server. Legacy HS256 tokens
 * fall back to getUser() inside getClaims().
 */
export async function requireAuth(
  supabase: SupabaseServerClient
): Promise<{ userId: string; agencyId: string }> {
  const { data: verified, error: authError } = await supabase.auth.getClaims()
  const userId = verified?.claims.sub
  if (authError || !userId) {
    throw new AuthError('Unauthorized', 401)
  }

  const agencyId = (await getCachedUserRecord(userId))?.agency_id ?? null
  if (!agencyId) {
    throw new AuthError('User not found', 404)
  }

  return { userId, agencyId }
}

export async function getUserRecord(
  supabase: SupabaseServerClient,
  userId: string
): Promise<{ agency_id: string; role: string } | null> {
  const { data } = await supabase.from('users').select(USER_AUTH_COLUMNS).eq('id', userId).single()
  return data as { agency_id: string; role: string } | null
}

export async function verifyClientOwnership(
  supabase: SupabaseServerClient,
  clientId: string,
  agencyId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('agency_id', agencyId)
    .single()
  return !!data
}

/**
 * A post the caller is allowed to touch, as the ownership check reads it.
 *
 * Named and exported because the shape grew past what "does this belong to you" implies, and an
 * anonymous return type let it grow unremarked: `client_name` seeds the `quote` lockup's byline and
 * the colour pair is what the editor's generate route paints on. Both ride on the row the check
 * already fetches, so they cost nothing here and save a query each at the two call sites that want
 * them — but they are a projection, and a projection deserves a name.
 */
export interface OwnedPost {
  id: string
  client_id: string
  client_name: string
  visual_ground: string | null
  visual_accent: string | null
}

/**
 * The post at `postId`, if it belongs to this agency via its client — else null.
 *
 * `fetchOwnedPost`, not `fetchOwnedPost`, which is what this was called through sixteen call
 * sites while returning five columns. A name promising a yes/no makes every field beyond it look
 * like scope creep, and made each addition an argument rather than a decision; naming the fetch
 * makes the projection the point and `OwnedPost` the place to argue about it.
 */
export async function fetchOwnedPost(
  supabase: SupabaseServerClient,
  postId: string,
  agencyId: string
): Promise<OwnedPost | null> {
  const { data } = await supabase
    .from('posts')
    .select('id, client_id, visual_ground, visual_accent, clients!inner(agency_id, name)')
    .eq('id', postId)
    .eq('clients.agency_id', agencyId)
    .single()
  if (!data) return null
  // Type assertion required: Supabase types cannot resolve the !inner join shape.
  //
  // The extra columns ride on the row this check already fetches. `name` seeds the `quote` lockup's
  // byline; the colour pair is what the editor's generate route paints on. Each was being read by a
  // second query against the same row moments later — the ownership check and the read that follows
  // it are one round trip, not two.
  const row = data as unknown as {
    id: string
    client_id: string
    visual_ground: string | null
    visual_accent: string | null
    clients: { name: string }
  }
  return {
    id: row.id,
    client_id: row.client_id,
    client_name: row.clients.name,
    visual_ground: row.visual_ground,
    visual_accent: row.visual_accent,
  }
}

/**
 * Verify a source belongs to the user's agency via its client.
 */
export async function verifySourceOwnership(
  supabase: SupabaseServerClient,
  sourceId: string,
  agencyId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('client_sources')
    .select('id, client_id, clients!inner(agency_id)')
    .eq('id', sourceId)
    .eq('clients.agency_id', agencyId)
    .single()
  return !!data
}

/**
 * Verify multiple posts belong to the user's agency in a single query.
 * Returns the set of verified post IDs.
 */
export async function verifyPostsOwnership(
  supabase: SupabaseServerClient,
  postIds: string[],
  agencyId: string
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set()
  const { data } = await supabase
    .from('posts')
    .select('id, clients!inner(agency_id)')
    .in('id', postIds)
    .eq('clients.agency_id', agencyId)
  // Type assertion required: Supabase types cannot resolve the !inner join shape
  const rows = (data ?? []) as unknown as Array<{ id: string }>
  return new Set(rows.map((r) => r.id))
}

/**
 * Like verifyClientOwnership, but returns the client row on success.
 * Use when you need client data immediately after ownership verification
 * to avoid a second round-trip to the database.
 */
export async function fetchClientWithOwnership(
  supabase: SupabaseServerClient,
  clientId: string,
  agencyId: string
): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .eq('agency_id', agencyId)
    .single()
  return data as { id: string; name: string } | null
}

/**
 * Resolve authentication for a Server Action.
 * Returns the auth context on success, or an error string on failure.
 * Mirrors resolveAuth() but returns ActionResult-shaped output instead of NextResponse.
 *
 * Reads the identity middleware already verified rather than verifying again: actions POST to
 * page URLs, which the middleware matcher covers, and it strips any client-supplied value from
 * this header before stamping its own — so an absent header means no valid session, and the
 * action fails closed. API routes cannot take this path; they are excluded from the matcher
 * and go through requireAuth above.
 */
export async function resolveActionAuth(): Promise<
  | { ok: true; supabase: SupabaseServerClient; agencyId: string; userId: string }
  | { ok: false; error: string }
> {
  const userId = (await headers()).get(AUTH_USER_ID_HEADER)
  if (!userId) {
    return { ok: false, error: 'Unauthorized' }
  }

  const agencyId = (await getCachedUserRecord(userId))?.agency_id ?? null
  if (!agencyId) {
    return { ok: false, error: 'User not found' }
  }

  const supabase = await createServerSupabaseClient()
  return { ok: true, supabase, agencyId, userId }
}

export async function verifyAdminRole(
  supabase: SupabaseServerClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase.from('users').select('role').eq('id', userId).single()
  return data?.role === 'admin'
}

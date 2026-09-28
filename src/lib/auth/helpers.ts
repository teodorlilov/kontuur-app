import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { headers } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { PostRow } from '@/types'
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
 * The user's agency and role — the ONE cached view of that row, for pages and routes alike, busted
 * by `USER_RECORD_TAG`: a second cache nobody busts keeps a removed member's `agency_id`, which is
 * an access-control bug. `unstable_cache` for the TTL inside React `cache` for one read per
 * render, with the admin client, since a request-scoped one cannot be captured across requests.
 * A cached "no row" is never served: `provisionUserRecord` (src/lib/auth/provision-user-record.ts)
 * creates the row just after a render can miss it, a render cannot bust the tag, and a cached miss
 * would send every page's `requireSessionUser` to sign-in (`SIGN_IN_PATH`) and back, in a loop. A miss re-reads
 * once, uncached.
 */
const _fetchUserRecord = unstable_cache(
  async (userId: string) => getUserRecord(createAdminSupabaseClient(), userId),
  ['user-record'],
  { revalidate: 300, tags: [USER_RECORD_TAG] }
)

export const getCachedUserRecord = cache(async (userId: string) => {
  const cached = await _fetchUserRecord(userId)
  return cached ?? getUserRecord(createAdminSupabaseClient(), userId)
})

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

async function getUserRecord(
  supabase: SupabaseServerClient,
  userId: string
): Promise<{ agency_id: string; role: string } | null> {
  const { data } = await supabase.from('users').select(USER_AUTH_COLUMNS).eq('id', userId).single()
  return data
}

export async function verifyClientOwnership(
  supabase: SupabaseServerClient,
  clientId: string,
  agencyId: string
): Promise<boolean> {
  return (await fetchClientWithOwnership(supabase, clientId, agencyId)) !== null
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
type OwnedPost = Pick<PostRow, 'id' | 'client_id' | 'visual_ground' | 'visual_accent'> & {
  /** clients.name through the ownership join — not a posts column. */
  client_name: string
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
export async function fetchOwnedSource(
  supabase: SupabaseServerClient,
  sourceId: string,
  agencyId: string
): Promise<{ id: string; client_id: string; type: string; file_path: string | null } | null> {
  const { data } = await supabase
    .from('client_sources')
    .select('id, client_id, type, file_path, clients!inner(agency_id)')
    .eq('id', sourceId)
    .eq('clients.agency_id', agencyId)
    .maybeSingle()
  // as: explicit projection over an inner-join filter — the generated types infer the table, not
  // the select. The join column is a filter only and is deliberately not returned.
  return data as { id: string; client_id: string; type: string; file_path: string | null } | null
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
  const { data, error } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .eq('agency_id', agencyId)
    .maybeSingle()

  // maybeSingle, and the error is READ. With `.single()` an absent row is itself an error
  // (PGRST116), so the two states were indistinguishable and both were discarded — every caller
  // answered "not yours" when the database was simply unreachable, and said nothing in the log.
  // The sharpest case is the Meta callback, which runs this check after the user has completed
  // Instagram consent: a transient read failure tells them they lack permission for their own
  // client, and the single-use code is already spent.
  //
  // Still fails closed. What changes is that the failure is now visible.
  if (error) {
    console.error(`[auth] client ownership check failed for ${clientId}:`, error.message)
    return null
  }
  return data as { id: string; name: string } | null
}

/**
 * The user id middleware validated for this request, or null when it stamped none — the one read
 * of `AUTH_USER_ID_HEADER`, with no auth-server round trip. Trusted on pages and server actions
 * only: middleware strips a client-sent header before stamping its own there
 * (src/lib/supabase/middleware.ts), but its matcher skips /api, where the header is whatever the
 * client sent. Never call it from a route handler.
 */
export async function getAuthUserId(): Promise<string | null> {
  return (await headers()).get(AUTH_USER_ID_HEADER)
}

/**
 * Resolve authentication for a Server Action: the counterpart of `resolveAuth`
 * (src/lib/auth/resolve-auth.ts), answering an error string instead of a NextResponse. The
 * identity is the one middleware already verified (`getAuthUserId`), so an absent one fails
 * closed; route handlers go through `requireAuth` instead. The cached role comes back with the
 * agency, so an admins-only action needs no second `users` read; `removeTeamMember` keeps its
 * fresh `verifyAdminRole` read on purpose: it changes who is an admin.
 */
export async function resolveActionAuth(): Promise<
  | { ok: true; supabase: SupabaseServerClient; agencyId: string; userId: string; role: string }
  | { ok: false; error: string }
> {
  const userId = await getAuthUserId()
  if (!userId) {
    return { ok: false, error: 'Unauthorized' }
  }

  const record = await getCachedUserRecord(userId)
  if (!record?.agency_id) {
    return { ok: false, error: 'User not found' }
  }

  const supabase = await createServerSupabaseClient()
  return { ok: true, supabase, agencyId: record.agency_id, userId, role: record.role }
}

export async function verifyAdminRole(
  supabase: SupabaseServerClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase.from('users').select('role').eq('id', userId).single()
  return data?.role === 'admin'
}

import { unstable_cache } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
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

/**
 * Cached agency_id lookup keyed by userId — uses admin client so it runs outside the React render tree.
 * TTL 5 minutes; invalidate with revalidateTag('user-agency') on agency membership changes.
 */
const _fetchAgencyId = unstable_cache(
  async (userId: string): Promise<string | null> => {
    const admin = createAdminSupabaseClient()
    const { data } = await admin.from('users').select('agency_id').eq('id', userId).single()
    return data?.agency_id ?? null
  },
  ['user-agency-id'],
  { revalidate: 300, tags: ['user-agency'] }
)

/**
 * Authenticate the current user and resolve their agency_id.
 * Throws AuthError on failure so routes can catch and return the appropriate HTTP status.
 */
export async function requireAuth(
  supabase: SupabaseServerClient
): Promise<{ userId: string; agencyId: string }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new AuthError('Unauthorized', 401)
  }

  const agencyId = await _fetchAgencyId(user.id)
  if (!agencyId) {
    throw new AuthError('User not found', 404)
  }

  return { userId: user.id, agencyId }
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
 * Verify a post belongs to the user's agency via its client.
 * Returns the post row on success, null if not found or not owned.
 */
export async function verifyPostOwnership(
  supabase: SupabaseServerClient,
  postId: string,
  agencyId: string
): Promise<{ id: string; client_id: string } | null> {
  const { data } = await supabase
    .from('posts')
    .select('id, client_id, clients!inner(agency_id)')
    .eq('id', postId)
    .eq('clients.agency_id', agencyId)
    .single()
  if (!data) return null
  // Type assertion required: Supabase types cannot resolve the !inner join shape
  const row = data as unknown as { id: string; client_id: string }
  return { id: row.id, client_id: row.client_id }
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

export async function verifyAdminRole(
  supabase: SupabaseServerClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase.from('users').select('role').eq('id', userId).single()
  return data?.role === 'admin'
}

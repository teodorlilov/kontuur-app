import { createServerSupabaseClient } from '@/lib/supabase/server'
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
 * Authenticate the current user and resolve their agency_id.
 * Throws AuthError on failure so routes can catch and return the appropriate HTTP status.
 */
export async function requireAuth(
  supabase: SupabaseServerClient
): Promise<{ userId: string; agencyId: string }> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new AuthError('Unauthorized', 401)
  }

  const agencyId = await getAgencyId(supabase, user.id)
  if (!agencyId) {
    throw new AuthError('User not found', 404)
  }

  return { userId: user.id, agencyId }
}

export async function getAgencyId(supabase: SupabaseServerClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('users')
    .select('agency_id')
    .eq('id', userId)
    .single()
  return data?.agency_id ?? null
}

export async function getUserRecord(
  supabase: SupabaseServerClient,
  userId: string
): Promise<{ agency_id: string; role: string } | null> {
  const { data } = await supabase
    .from('users')
    .select(USER_AUTH_COLUMNS)
    .eq('id', userId)
    .single()
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
  const { data: post } = await supabase
    .from('posts')
    .select('id, client_id')
    .eq('id', postId)
    .single()

  if (!post) return null

  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('id', post.client_id)
    .eq('agency_id', agencyId)
    .single()

  if (!client) return null
  return post
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
 * Verify a user has admin role within their agency.
 */
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
  return (data as { id: string; name: string } | null)
}

export async function verifyAdminRole(
  supabase: SupabaseServerClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()
  return data?.role === 'admin'
}

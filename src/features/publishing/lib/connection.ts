import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { SOCIAL_CONNECTION_AUTH_COLUMNS } from '@/lib/queries/select-columns'
import type { InstagramConnection } from '@/features/publishing/lib/types'

/**
 * The credentials for one client's account on one network.
 *
 * Written out three times before this — the cron's scheduler, the resume path in
 * `publish-post.ts`, and the publish-now route — with the same projection, the same two
 * filters and the same narrowing cast in each. The scheduler already had it as a named
 * helper; the other two grew their own copies as the publish path was re-rooted onto
 * destinations, which is the third occurrence the no-duplication rule exists to stop.
 *
 * `maybeSingle`: a client with no connection for this network is an expected state that the
 * publish path reports per destination, not a query failure worth aborting a whole cron run.
 */
export async function fetchConnection(
  admin: SupabaseClient,
  clientId: string,
  platform: string
): Promise<InstagramConnection | null> {
  const { data, error } = await admin
    .from('social_connections')
    .select(SOCIAL_CONNECTION_AUTH_COLUMNS)
    .eq('client_id', clientId)
    .eq('platform', platform)
    .maybeSingle()
  if (error) throw new Error(`connection lookup failed for client ${clientId}: ${error.message}`)
  // WHY as: Supabase returns the exact fields projected; narrow to the credential shape.
  return data as InstagramConnection | null
}

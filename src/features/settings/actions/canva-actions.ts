'use server'

import 'server-only'
import { resolveActionAuth } from '@/lib/auth/helpers'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { parseActionId } from '@/lib/actions/parse-input'
import type { ActionResult } from '@/lib/actions/types'

/** Disconnect the current user's Canva connection. */
export async function disconnectCanvaConnection(connectionId: string): Promise<ActionResult> {
  const parsed = parseActionId(connectionId, 'connectionId')
  if (!parsed.ok) return parsed.result

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }

  /**
   * The service-role client is REQUIRED here, not a shortcut.
   *
   * The only policy on `social_connections` is `social_connections_agency_isolation`, keyed on
   * `client_id in (select clients.id …)`. A Canva row is owned by a user, not a client, so its
   * `client_id` is NULL — and `NULL in (subquery)` is NULL, never true. A user-scoped client
   * therefore cannot see or delete a Canva connection at all, and the delete would report success
   * having removed nothing.
   *
   * That is why ownership is proven in TypeScript below instead: `user_id` against the caller. Its
   * Instagram twin (`disconnectConnection`) can use the RLS-scoped client precisely because IG rows
   * DO carry a client_id, so the policy covers them.
   */
  const admin = createAdminSupabaseClient()

  // Verify the connection belongs to the current user
  const { data: connection } = await admin
    .from('social_connections')
    .select('id, user_id')
    .eq('id', connectionId)
    .eq('platform', 'canva')
    .single()

  if (!connection || connection.user_id !== auth.userId) {
    return { ok: false, error: 'Not found' }
  }

  const { error } = await admin.from('social_connections').delete().eq('id', connectionId)
  if (error) return { ok: false, error: error.message }

  return { ok: true, data: undefined }
}

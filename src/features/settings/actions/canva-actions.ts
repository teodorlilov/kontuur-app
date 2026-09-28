'use server'

import 'server-only'
import { resolveActionAuth } from '@/lib/auth/helpers'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { parseActionId } from '@/lib/actions/parse-input'
import type { ActionResult } from '@/lib/actions/types'

/**
 * Disconnect the current user's Canva connection.
 *
 * The service-role client is REQUIRED, not a shortcut. The only policy on `social_connections`,
 * `social_connections_agency_isolation` (migration 20260818_capture_rls_policy_baseline), is keyed
 * on `client_id in (select clients.id …)`. A Canva row belongs to a user, so its `client_id` is
 * NULL and `NULL in (subquery)` is never true: a user-scoped client can neither see nor delete it,
 * and the delete would report success having removed nothing. Ownership is therefore proven here,
 * `user_id` against the caller. The Instagram twin (`disconnectConnection`,
 * src/features/clients/actions/connection-actions.ts) can stay on the RLS-scoped client because IG
 * rows carry a `client_id`.
 */
export async function disconnectCanvaConnection(connectionId: string): Promise<ActionResult> {
  const parsed = parseActionId(connectionId, 'connectionId')
  if (!parsed.ok) return parsed.result

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }

  const admin = createAdminSupabaseClient()

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

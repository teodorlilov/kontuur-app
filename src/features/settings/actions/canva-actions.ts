'use server'

import { resolveActionAuth } from '@/lib/auth/helpers'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { ActionResult } from '@/lib/actions/types'

/** Disconnect the current user's Canva connection. */
export async function disconnectCanvaConnection(connectionId: string): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }

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

'use server'

import { revalidateTag } from 'next/cache'
import { resolveActionAuth } from '@/lib/auth/helpers'
import type { ActionResult } from './types'

/** Disconnect a social connection by ID. */
export async function disconnectConnection(connectionId: string): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  // Verify the connection belongs to a client owned by this agency
  const { data: connection } = (await supabase
    .from('social_connections')
    .select('id, client_id, clients!inner(agency_id)')
    .eq('id', connectionId)
    .single()) as { data: (Record<string, unknown> & { clients: { agency_id: string } }) | null }

  if (!connection || connection.clients.agency_id !== agencyId) {
    return { ok: false, error: 'Not found' }
  }

  const { error } = await supabase.from('social_connections').delete().eq('id', connectionId)
  if (error) return { ok: false, error: error.message }

  revalidateTag('agency-clients', 'max')
  return { ok: true, data: undefined }
}

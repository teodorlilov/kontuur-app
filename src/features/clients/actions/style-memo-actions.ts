'use server'

import { revalidatePath } from 'next/cache'
import { resolveActionAuth } from '@/lib/auth/helpers'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchClientById, fetchBrandProfileByClient } from '@/lib/queries/db'
import { distillStyleMemo } from '@/ai/learning/distill-style-memo'
import type { ActionResult } from '@/lib/actions/types'

/**
 * On-demand distillation from the client settings surface. Force-runs (no
 * staleness gate) but the distiller still requires enough new edits — a click
 * cannot fabricate learning out of too little evidence.
 */
export async function refreshStyleMemo(
  clientId: string
): Promise<ActionResult<{ updated: boolean; bulletCount: number }>> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const client = await fetchClientById(supabase, clientId, agencyId)
  if (!client) return { ok: false, error: 'Client not found' }

  try {
    const profile = await fetchBrandProfileByClient(supabase, clientId)
    const result = await distillStyleMemo(createAdminSupabaseClient(), clientId, {
      language: client.language,
      languageNotes: profile?.language_notes ?? '',
    })
    revalidatePath(`/clients/${clientId}/edit`)
    return { ok: true, data: result }
  } catch (err) {
    console.error('[style-memo] manual refresh failed:', err)
    return { ok: false, error: 'Could not refresh the memo — try again.' }
  }
}

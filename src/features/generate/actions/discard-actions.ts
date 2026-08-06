'use server'

import 'server-only'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { resolveActionAuth, verifyClientOwnership } from '@/lib/auth/helpers'
import { discardedDraftSchema, type DiscardedDraftInput } from '@/features/generate/schemas'
import type { ActionResult } from '@/lib/actions/types'

/**
 * Record an explicitly discarded wizard draft — the negative outcome signal
 * for per-source usefulness stats. Best-effort: failures log and return
 * ok:false but must never surface to the wizard UX.
 */
export async function logDiscardedDraft(input: DiscardedDraftInput): Promise<ActionResult> {
  const parsed = discardedDraftSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid discard payload' }

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const owned = await verifyClientOwnership(supabase, parsed.data.clientId, agencyId)
  if (!owned) return { ok: false, error: 'Not found' }

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('discarded_drafts').insert({
    client_id: parsed.data.clientId,
    client_source_id: parsed.data.clientSourceId,
    pillar: parsed.data.pillar,
    source_url: parsed.data.sourceUrl,
    source_type: parsed.data.sourceType,
    platform: parsed.data.platform,
    discarded_from: 'wizard',
  })

  if (error) {
    console.error('[generate] failed to log discarded draft:', error.message)
    return { ok: false, error: 'Failed to log discard' }
  }
  return { ok: true, data: undefined }
}

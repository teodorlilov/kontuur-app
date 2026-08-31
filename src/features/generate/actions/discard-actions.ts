'use server'

import 'server-only'
import { resolveActionAuth, verifyClientOwnership } from '@/lib/auth/helpers'
import { recordDiscardedDraft } from '@/lib/queries/discarded-drafts'
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

  // The row itself is built and written in one place — `deletePost` records the same eight columns
  // for a discard from the review queue, and the two assembled them separately.
  const written = await recordDiscardedDraft({
    clientId: parsed.data.clientId,
    clientSourceId: parsed.data.clientSourceId,
    pillar: parsed.data.pillar,
    sourceUrl: parsed.data.sourceUrl,
    sourceType: parsed.data.sourceType,
    platform: parsed.data.platform,
    discardedFrom: 'wizard',
    // No reason: the wizard never asks for one, and `distill-style-memo` reads only rows that
    // carry one. Sending a placeholder would put wizard discards in that pool.
  })
  return written ? { ok: true, data: undefined } : { ok: false, error: 'Failed to log discard' }
}

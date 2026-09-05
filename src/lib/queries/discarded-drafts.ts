import 'server-only'

import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { DiscardReason } from '@/lib/validation'

/**
 * Where a draft was thrown away.
 *
 * A closed vocabulary, unlike the two free-typed literals it replaces — one in the wizard's action
 * and one in `deletePost`, in different files, each the only thing naming its own value.
 * `reason` next door has had `DISCARD_REASONS` mirroring a database check constraint all along;
 * this column had nothing.
 */
export const DISCARD_SOURCES = ['wizard', 'review'] as const
export type DiscardSource = (typeof DISCARD_SOURCES)[number]

/** One rejected draft, as outcome telemetry. Provenance is copied from the post it came from. */
export interface DiscardedDraft {
  clientId: string
  clientSourceId: string | null
  pillar: string | null
  sourceUrl: string | null
  sourceType: string | null
  discardedFrom: DiscardSource
  /**
   * Why, when a human said. Optional on purpose and NOT defaulted: the wizard never collects one,
   * and `distill-style-memo` filters `.not('reason','is',null)` to read only the rows that carry a
   * stated reason. Writing a placeholder here would put wizard discards into that pool.
   */
  reason?: DiscardReason | null
}

/**
 * Record a discarded draft — the one writer of `discarded_drafts`.
 *
 * Both discard surfaces feed one reader (`fetchSourceUsageStats` → `discardedCount`), and they
 * built the row separately: the wizard through a zod schema, `deletePost` from a hand-assembled
 * literal with no schema at all. Same columns, two spellings, and only one of them coalesced
 * its optional provenance fields.
 *
 * Best-effort by contract. This is telemetry attached to an action the user has already taken —
 * failing their discard because the analytics write failed would be the wrong trade — so it logs
 * and reports rather than throwing. Callers decide whether they care.
 */
export async function recordDiscardedDraft(draft: DiscardedDraft): Promise<boolean> {
  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('discarded_drafts').insert({
    client_id: draft.clientId,
    client_source_id: draft.clientSourceId,
    pillar: draft.pillar,
    source_url: draft.sourceUrl,
    source_type: draft.sourceType,
    discarded_from: draft.discardedFrom,
    reason: draft.reason ?? null,
  })
  if (error) {
    console.error(`[discard] could not log a ${draft.discardedFrom} discard:`, error.message)
    return false
  }
  return true
}

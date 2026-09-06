import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * What the two networks' narrative modules share — extracted when Facebook's arrived
 * (2026-09-07), the same split `sync-shared.ts` made for the syncs: the vocabulary and the
 * one query that must not drift live here; the facts builders, prompts-by-way-of-facts and
 * cache identities stay per network, because what a network can honestly say about itself
 * differs (Facebook has no reach, no audience, no formats to narrate).
 */

export interface NarrativeResult {
  text: string
  /** True when the words came from an exported report, not a fresh generation. */
  archived: boolean
}

/**
 * The stored wording of an exported report for exactly this window, or null.
 *
 * Account- AND platform-scoped: both networks archive into `analytics_reports`, so a lookup
 * without the platform filter could hand one network's words to the other's document — and a
 * report exported for a previously connected account must never resurface after a reconnect.
 */
export async function fetchArchivedSummary(
  admin: SupabaseClient,
  scope: { clientId: string; accountId: string; platform: string; start: string; end: string }
): Promise<string | null> {
  const { data, error } = await admin
    .from('analytics_reports')
    .select('ai_summary')
    .eq('client_id', scope.clientId)
    .eq('platform_account_id', scope.accountId)
    .eq('platform', scope.platform)
    .eq('period_start', scope.start)
    .eq('period_end', scope.end)
    .maybeSingle()
  if (error) throw new Error(`archived summary lookup failed: ${error.message}`)
  // WHY as: the shared admin client is untyped, so the projection does not infer.
  return (data as { ai_summary: string } | null)?.ai_summary ?? null
}

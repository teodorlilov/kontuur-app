/**
 * generation_runs lifecycle — the single place that reads or writes a run's
 * progress. Every generation entry point (wizard stream, idea-to-post, cron)
 * records a run here so the app shell can show what is composing right now.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActiveRun } from '@/types/api'

/** A run is only shown as active this long — a crashed invocation cannot mark itself done. */
const ACTIVE_RUN_WINDOW_MS = 6 * 60_000

interface ActiveRunRow {
  id: string
  client_id: string | null
  created_at: string | null
  target_count: number | null
  clients: { name: string | null } | null
  generation_themes: Array<{ post_count: number | null }>
}

/** Records the start of a generation batch. Returns the run id, or null if tracking failed. */
export async function startGenerationRun(
  supabase: SupabaseClient,
  input: { clientId: string; platform: string; targetCount: number }
): Promise<string | null> {
  const { data } = await supabase
    .from('generation_runs')
    .insert({
      client_id: input.clientId,
      platform: input.platform,
      target_count: input.targetCount,
      status: 'running',
    })
    .select('id')
    .single()

  return (data as { id: string } | null)?.id ?? null
}

/** Marks a run terminal so the shell stops reporting it as in flight. */
export async function finishGenerationRun(
  supabase: SupabaseClient,
  runId: string,
  status: 'complete' | 'failed'
): Promise<void> {
  await supabase
    .from('generation_runs')
    .update({ status, completed_at: new Date().toISOString() })
    .eq('id', runId)
}

/** Runs an agency has in flight right now, with how many posts have landed so far. */
export async function fetchActiveRuns(
  supabase: SupabaseClient,
  agencyId: string
): Promise<ActiveRun[]> {
  const cutoff = new Date(Date.now() - ACTIVE_RUN_WINDOW_MS).toISOString()

  const { data, error } = await supabase
    .from('generation_runs')
    .select('id, client_id, created_at, target_count, clients!inner(name, agency_id), generation_themes(post_count)')
    .eq('status', 'running')
    .eq('clients.agency_id', agencyId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })

  // Surfacing this matters: a failure here would otherwise read as "nothing is
  // generating" rather than as an error.
  if (error) {
    console.error('[generation] active runs query failed:', error.message)
    return []
  }

  // clients is many-to-one, so PostgREST returns an object where the generated
  // types describe the generic embed — verified against the live schema.
  const rows = (data as unknown as ActiveRunRow[] | null) ?? []

  return rows.map((row) => ({
    id: row.id,
    clientName: row.clients?.name ?? 'Client',
    targetCount: row.target_count ?? 0,
    doneCount: row.generation_themes.reduce((sum, theme) => sum + (theme.post_count ?? 0), 0),
    startedAt: row.created_at ?? new Date().toISOString(),
  }))
}

/**
 * Fetches theme descriptions from recent generation runs for a client.
 * Used to extend post history so the research pipeline avoids re-suggesting
 * themes that were already generated (but not yet in post_history).
 */
export async function fetchThemeDescriptions(
  supabase: SupabaseClient,
  clientId: string,
  limit = 10
): Promise<string[]> {
  const { data } = await supabase
    .from('generation_runs')
    .select('generation_themes(theme_description)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit)

  const rows = data as Array<{
    generation_themes: Array<{ theme_description: string | null }>
  }> | null

  return (rows ?? []).flatMap((run) =>
    run.generation_themes.map((theme) => theme.theme_description).filter((t): t is string => t !== null)
  )
}

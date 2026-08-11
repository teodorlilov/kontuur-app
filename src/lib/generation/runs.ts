/**
 * generation_runs lifecycle — the single place that reads or writes a run's
 * progress. Every generation entry point (wizard stream, idea-to-post, cron)
 * records a run here so the app shell can show what is composing right now.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { formatClientName } from '@/utils/format'
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

/**
 * Where a run came from. The generate cron's dedup counts only its own runs, so a
 * run a human asked for cannot cancel that client's scheduled batch for the day.
 */
export type GenerationRunKind = 'cron' | 'manual'

/** Records the start of a generation batch. Returns the run id, or null if tracking failed. */
export async function startGenerationRun(
  supabase: SupabaseClient,
  input: { clientId: string; platform: string; targetCount: number; kind: GenerationRunKind }
): Promise<string | null> {
  const { data, error } = await supabase
    .from('generation_runs')
    .insert({
      client_id: input.clientId,
      platform: input.platform,
      target_count: input.targetCount,
      kind: input.kind,
      status: 'running',
    })
    .select('id')
    .single()

  // Generation itself still proceeds without a run row, so this is logged
  // rather than thrown — but losing the reason would make it undiagnosable.
  if (error) {
    console.error(`[generation] could not open a run for client ${input.clientId}:`, error.message)
    return null
  }

  return (data as { id: string } | null)?.id ?? null
}

/** Marks a run terminal so the shell stops reporting it as in flight. */
export async function finishGenerationRun(
  supabase: SupabaseClient,
  runId: string,
  status: 'complete' | 'failed'
): Promise<void> {
  const { error } = await supabase
    .from('generation_runs')
    .update({ status, completed_at: new Date().toISOString() })
    .eq('id', runId)

  // The staleness window hides this from the UI within minutes, which is
  // exactly why it would otherwise never be noticed.
  if (error) {
    console.error(`[generation] could not close run ${runId} as ${status}:`, error.message)
  }
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
    clientName: formatClientName(row.clients?.name),
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
  const { data, error } = await supabase
    .from('generation_runs')
    .select('generation_themes(theme_description)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit)

  // Generation still runs on an empty history — it just loses the guard against
  // re-suggesting a theme, which reads downstream as the model repeating itself
  // rather than as a query that failed.
  if (error) {
    console.error(`[generation] theme history query failed for client ${clientId}:`, error.message)
    return []
  }

  // Same embed shape as fetchActiveRuns above: PostgREST nests the themes, and the
  // generated types describe the generic embed rather than this projection.
  const rows = data as Array<{
    generation_themes: Array<{ theme_description: string | null }>
  }> | null

  return (rows ?? []).flatMap((run) =>
    run.generation_themes.map((theme) => theme.theme_description).filter((t): t is string => t !== null)
  )
}

/**
 * Record a theme a run produced. Best-effort: a failed insert must not sink the
 * batch, but it must not vanish either — a dropped row under-reports `doneCount`
 * in `fetchActiveRuns` and silently shrinks the exclusion list the next run reads.
 */
export async function trackGenerationTheme(
  supabase: SupabaseClient,
  runId: string | null,
  theme: { description: string; isPriority?: boolean; brief?: string; targetDate?: string; sourceExcerpt?: string },
  postCount: number
): Promise<void> {
  if (!runId) return
  const { error } = await supabase.from('generation_themes').insert({
    run_id: runId,
    theme_description: theme.description,
    post_count: postCount,
    is_priority: theme.isPriority ?? false,
    priority_brief: theme.brief ?? null,
    target_date: theme.targetDate ?? null,
    research_used: !!theme.sourceExcerpt,
  })
  if (error) {
    console.error(`[generation] theme insert failed for run ${runId}:`, error.message)
  }
}

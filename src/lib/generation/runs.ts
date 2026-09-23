/**
 * generation_runs lifecycle — the single place that reads or writes a run's
 * progress. Every generation entry point (wizard stream, idea-to-post, cron)
 * records a run here so the app shell can show what is composing right now.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { formatClientName } from '@/utils/format'
import type { ActiveRun } from '@/types/api'
import type { Json } from '@/types/database'
import type { Entitlement } from '@/lib/billing/entitlement'
import { type AllowanceError, consumeUsage, settleUsage } from '@/lib/billing/usage'

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
type GenerationRunKind = 'cron' | 'manual'

/** Postgres unique_violation — the slot index rejected a second claim on the same slot. */
const UNIQUE_VIOLATION = '23505'

/**
 * The outcome of claiming a generation run.
 *
 * `slotTaken` separates the two ways a claim comes back empty, because they want
 * opposite handling: a lost race means another invocation is generating this exact
 * batch right now and there is nothing to report, while a failed insert means
 * tracking broke and the batch is deferred.
 */
type GenerationRunClaim =
  | { runId: string }
  | { runId: null; slotTaken: boolean }
  | { runId: null; refused: AllowanceError }

/**
 * Claims a generation batch, returning the run id.
 *
 * The draft allowance is reserved here, BEFORE the insert and before any model call: this is the
 * one moment the number of drafts is known and nothing has been spent, so a refused workspace
 * costs nothing (docs/plans/BILLING.md, layer 1). A refusal is a claim of its own that both
 * callers must honour — the "generation proceeds without a run row" path below is for a failed
 * insert, never for a refusal, and a reservation whose insert then fails is given back.
 *
 * `slotKey` is the scheduled instant a cron batch belongs to. Passing it makes the
 * insert the dedup: `generation_runs_one_batch_per_slot` lets exactly one invocation
 * of a tick through, which a snapshot read of recent runs can never do on its own
 * (Vercel cron is at-least-once, so two invocations read "nothing ran" together).
 * Manual runs pass none and are never deduped. A lost slot race also gives the reservation back.
 */
export async function startGenerationRun(
  supabase: SupabaseClient,
  input: {
    clientId: string
    agencyId: string
    entitlement: Entitlement
    targetCount: number
    kind: GenerationRunKind
    slotKey?: Date
  }
): Promise<GenerationRunClaim> {
  const reserved = await consumeUsage(input.entitlement, input.agencyId, 'draft', input.targetCount)
  if (!reserved.allowed) return { runId: null, refused: reserved.refused }
  const giveBack = () =>
    settleUsage(input.entitlement, input.agencyId, 'draft', input.targetCount, 0)

  const { data, error } = await supabase
    .from('generation_runs')
    .insert({
      client_id: input.clientId,
      target_count: input.targetCount,
      kind: input.kind,
      status: 'running',
      // Explicitly null for a manual run rather than absent: NULLs do not conflict in a
      // unique index, which is what keeps the slot constraint off every wizard run.
      slot_key: input.slotKey?.toISOString() ?? null,
    })
    .select('id')
    .single()

  if (error) {
    await giveBack()
    // A lost race is the constraint doing its job, not a fault: the invocation that
    // won is generating this batch, and saying so at error level would train whoever
    // reads these logs to ignore them.
    if (error.code === UNIQUE_VIOLATION) return { runId: null, slotTaken: true }
    // Generation itself still proceeds without a run row, so this is logged
    // rather than thrown — but losing the reason would make it undiagnosable.
    console.error(`[generation] could not open a run for client ${input.clientId}:`, error.message)
    return { runId: null, slotTaken: false }
  }

  const runId = (data as { id: string } | null)?.id
  if (!runId) await giveBack()
  return runId ? { runId } : { runId: null, slotTaken: false }
}

/**
 * What a run ended as: how it finished, what it reserved against what landed, and the pillars
 * research could not cover. One object because these are one fact — the same `finally` knows all
 * of it, and a run closed with any part missing is a run nobody can explain afterwards.
 */
interface RunOutcome {
  status: 'complete' | 'failed'
  agencyId: string
  entitlement: Entitlement
  reserved: number
  landed: number
  /** Null for a run that skipped nothing, and for every run that never got as far as research. */
  skipped: SkippedPillars | null
}

/**
 * The pillars a run could not cover, kept on the run itself.
 *
 * `cost` is what those pillars were allocated — the orchestrator's own number, not a re-derivation
 * — so the reviewer is told the run came back short only when it actually did. Stored because a
 * draft read back tomorrow has no stream behind it to have said so.
 */
export interface SkippedPillars {
  names: string[]
  cost: number
}

/** What a waiting group's run can still tell its reviewer, days after the run itself ended. */
export interface WaitingRun {
  /** What the run was asked for — the number the banner's "instead of" compares against. */
  targetCount: number | null
  skipped: SkippedPillars | null
}

/**
 * Marks a run terminal so the shell stops reporting it as in flight, and settles the drafts it
 * reserved: what landed is counted — the posts written, or the drafts streamed — and the rest of
 * the reservation is given back, whether research found fewer topics than asked or the run failed
 * before writing. A customer is charged for what exists, never for what was requested.
 */
export async function finishGenerationRun(
  supabase: SupabaseClient,
  runId: string,
  outcome: RunOutcome
): Promise<void> {
  await settleUsage(
    outcome.entitlement,
    outcome.agencyId,
    'draft',
    outcome.reserved,
    outcome.landed
  )
  const { error } = await supabase
    .from('generation_runs')
    .update({
      status: outcome.status,
      completed_at: new Date().toISOString(),
      skipped_pillars: outcome.skipped,
    })
    .eq('id', runId)

  // The staleness window hides this from the UI within minutes, which is
  // exactly why it would otherwise never be noticed.
  if (error) {
    console.error(`[generation] could not close run ${runId} as ${outcome.status}:`, error.message)
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
    .select(
      'id, client_id, created_at, target_count, clients!inner(name, agency_id), generation_themes(post_count)'
    )
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
    run.generation_themes
      .map((theme) => theme.theme_description)
      .filter((t): t is string => t !== null)
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
  theme: {
    description: string
    isPriority?: boolean
    brief?: string
    targetDate?: string
    sourceExcerpt?: string
  },
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

/**
 * The runs behind a set of waiting drafts, by run id.
 *
 * Read once for a whole resume rather than per group: the drafts carry their run id, and this is
 * what turns it into what the reviewer is owed — what was asked for, and which pillars research
 * could not cover. Degrades to nothing on a failed read: the drafts are the point, and a group
 * without its run simply shows no banner.
 */
export async function fetchWaitingRuns(
  supabase: SupabaseClient,
  runIds: string[]
): Promise<Map<string, WaitingRun>> {
  const byId = new Map<string, WaitingRun>()
  if (runIds.length === 0) return byId

  const { data, error } = await supabase
    .from('generation_runs')
    .select('id, target_count, skipped_pillars')
    .in('id', runIds)
  if (error) {
    console.error('[generation] waiting run read failed:', error.message)
    return byId
  }

  for (const row of data ?? []) {
    byId.set(row.id, {
      targetCount: row.target_count,
      skipped: toSkippedPillars(row.skipped_pillars),
    })
  }
  return byId
}

/**
 * The stored jsonb as the app's shape, or null for anything else.
 *
 * `skipped_pillars` is written by one function and read by one, but it is still a column the
 * generated types describe as `Json` — a run closed before the column existed, or by an older
 * deploy, comes back as null, and a malformed value must read as "nothing to say" rather than
 * render a banner about undefined pillars.
 */
function toSkippedPillars(value: Json): SkippedPillars | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const stored = value as { names?: unknown; cost?: unknown }
  if (!Array.isArray(stored.names) || typeof stored.cost !== 'number') return null
  return {
    names: stored.names.filter((name): name is string => typeof name === 'string'),
    cost: stored.cost,
  }
}

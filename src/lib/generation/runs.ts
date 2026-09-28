/**
 * generation_runs lifecycle — the single place that reads or writes a run's
 * progress. Every generation entry point (wizard stream, idea-to-post, cron)
 * records a run here so the app shell can show what is composing right now.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { formatClientName } from '@/utils/format'
import { UNIQUE_VIOLATION } from '@/utils/constants'
import type { ActiveRun } from '@/types/api'
import type { Database, Json } from '@/types/database'
import type { AdminClient } from '@/lib/supabase/admin'
import type { Entitlement } from '@/lib/billing/entitlement'
import {
  type AllowanceError,
  consumeUsage,
  lastDailyResetAt,
  settleUsage,
} from '@/lib/billing/usage'
import { getCachedEntitlement } from '@/lib/queries/cache'
import { RECENT_RUN_COLUMNS } from '@/lib/queries/select-columns'
import { readPages } from '@/lib/queries/read-pages'

/** A run is only shown as active this long — a crashed invocation cannot mark itself done. */
const ACTIVE_RUN_WINDOW_MS = 6 * 60_000

/**
 * A run still `running` this long after it started was killed with its invocation: the longest
 * `maxDuration` is 300 s, so nothing alive is this old.
 */
const ABANDONED_RUN_AFTER_MS = 15 * 60_000

/**
 * Where a run came from. The generate cron's dedup counts only its own runs, so a
 * run a human asked for cannot cancel that client's scheduled batch for the day.
 */
type GenerationRunKind = 'cron' | 'manual'

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
 * Claims a generation batch, returning the run id. The drafts are reserved first — before the
 * insert and any model call, so a refused workspace costs nothing (docs/plans/BILLING.md, layer 1)
 * — and a run that could not be opened gives them back, since nothing else would settle them. The
 * run stores the reservation's `period_key`, where whoever settles it lands the drafts.
 *
 * `slotKey` makes the insert a cron batch's dedup (`generation_runs_one_batch_per_slot`): Vercel
 * cron is at-least-once, and no read of recent runs stops two invocations of one tick. A manual
 * run writes it as explicit null, since NULLs never conflict in a unique index.
 */
export async function startGenerationRun(
  supabase: SupabaseClient<Database>,
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
    settleUsage(input.entitlement, input.agencyId, 'draft', {
      reserved: input.targetCount,
      landed: 0,
    })

  const { data, error } = await supabase
    .from('generation_runs')
    .insert({
      client_id: input.clientId,
      target_count: input.targetCount,
      kind: input.kind,
      status: 'running',
      slot_key: input.slotKey?.toISOString() ?? null,
      period_key: input.entitlement.periodKey,
    })
    .select('id')
    .single()

  if (error) {
    await giveBack()
    if (error.code === UNIQUE_VIOLATION) return { runId: null, slotTaken: true }
    console.error(`[generation] could not open a run for client ${input.clientId}:`, error.message)
    return { runId: null, slotTaken: false }
  }

  const runId = data?.id
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
 * Marks a run terminal and settles its drafts: what landed is counted and the rest of the
 * reservation given back, so a customer pays for what exists, never for what was asked. It settles
 * only when this call flipped the run out of `running` — `closeAbandonedRuns` claims runs by the
 * same conditional flip, so exactly one of the two settles. A failed flip is logged, since the
 * shell hides a stale run within minutes and nothing else would show it; the closer settles it.
 */
export async function finishGenerationRun(
  supabase: SupabaseClient,
  runId: string,
  outcome: RunOutcome
): Promise<void> {
  const { data, error } = await supabase
    .from('generation_runs')
    .update({
      status: outcome.status,
      completed_at: new Date().toISOString(),
      skipped_pillars: outcome.skipped,
    })
    .eq('id', runId)
    .eq('status', 'running')
    .select('id')
  if (error) {
    console.error(`[generation] could not close run ${runId} as ${outcome.status}:`, error.message)
    return
  }
  if (!data?.length) return
  await settleUsage(outcome.entitlement, outcome.agencyId, 'draft', {
    reserved: outcome.reserved,
    landed: outcome.landed,
  })
}

/** One run of the last day as the generate cron reads it. */
export interface RecentRun {
  id: string
  clientId: string | null
  agencyId: string | null
  kind: string
  status: string
  createdAt: string
  targetCount: number | null
  periodKey: string | null
}

/**
 * The runs of the last `since` window the generate cron acts on — scheduled runs running or
 * complete, which its slot dedup reads (`lastCronRunAt`), and runs of any kind still running,
 * which the abandoned-run closer reads (`closeAbandonedRuns`): its one read of runs per tick, every
 * page of it (`readPages`). Throws on a failed read: an unread failure would read as "nothing ran
 * recently" and regenerate a batch every client already has.
 */
export async function fetchRecentRuns(supabase: AdminClient, since: Date): Promise<RecentRun[]> {
  const runs: RecentRun[] = []
  const pages = readPages('recent run query', (from, to) =>
    supabase
      .from('generation_runs')
      .select(RECENT_RUN_COLUMNS)
      .in('status', ['running', 'complete'])
      .or('kind.eq.cron,status.eq.running')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  )
  for await (const page of pages) {
    for (const run of page) {
      runs.push({
        id: run.id,
        clientId: run.client_id,
        agencyId: run.clients?.agency_id ?? null,
        kind: run.kind,
        status: run.status,
        createdAt: run.created_at ?? '',
        targetCount: run.target_count,
        periodKey: run.period_key,
      })
    }
  }
  return runs
}

/**
 * Per client, when its latest scheduled batch started — the dedup the generate cron checks a slot
 * against. Only `kind: 'cron'` runs count, so a run a human asked for cannot cancel the day's
 * batch; a failed run saved nothing and would cancel the same-day retries, so it never counts.
 */
export function lastCronRunAt(runs: RecentRun[]): Map<string, number> {
  const last = new Map<string, number>()
  for (const run of runs) {
    if (run.kind !== 'cron' || run.status === 'failed' || !run.clientId) continue
    const at = new Date(run.createdAt).getTime()
    if (at > (last.get(run.clientId) ?? 0)) last.set(run.clientId, at)
  }
  return last
}

/**
 * Close the runs a killed invocation left `running` (older than `ABANDONED_RUN_AFTER_MS`) and
 * return the runs with their new statuses, so the same tick can retry a slot closed as failed.
 * Each is claimed by the same conditional flip `finishGenerationRun` uses; only a won claim settles, into the
 * period the run reserved from. Its reservation is released only when taken after
 * `lastDailyResetAt` (src/lib/billing/usage.ts), so the retry is not sized against a dead
 * reservation; an older one may already be cleared by `clearStaleReservations`, so it releases
 * nothing. Throws on a failed read or write, for the cron to log.
 */
export async function closeAbandonedRuns(
  supabase: AdminClient,
  runs: RecentRun[],
  now: Date = new Date()
): Promise<RecentRun[]> {
  const cutoff = now.getTime() - ABANDONED_RUN_AFTER_MS
  const closed = new Map<string, 'complete' | 'failed'>()
  for (const run of runs) {
    if (run.status !== 'running' || new Date(run.createdAt).getTime() > cutoff) continue
    const { count, error } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('generation_run_id', run.id)
    if (error) throw new Error(`landed drafts count failed for run ${run.id}: ${error.message}`)
    const landed = count ?? 0
    const status = landed > 0 ? 'complete' : 'failed'
    const { data, error: flipError } = await supabase
      .from('generation_runs')
      .update({ status, completed_at: now.toISOString() })
      .eq('id', run.id)
      .eq('status', 'running')
      .select('id')
    if (flipError) throw new Error(`closing run ${run.id} failed: ${flipError.message}`)
    if (data.length === 0) continue
    closed.set(run.id, status)
    if (run.periodKey && run.agencyId && run.targetCount) {
      const entitlement = await getCachedEntitlement(run.agencyId)
      const releasable = Date.parse(run.createdAt) >= lastDailyResetAt(now).getTime()
      await settleUsage({ ...entitlement, periodKey: run.periodKey }, run.agencyId, 'draft', {
        reserved: run.targetCount,
        landed,
        release: releasable ? run.targetCount : 0,
      })
    }
  }
  return runs.map((run) => {
    const status = closed.get(run.id)
    return status ? { ...run, status } : run
  })
}

/**
 * Runs an agency has in flight right now, with how many posts have landed so far. A failed read is
 * logged and answers no runs — logged because an empty answer would otherwise read as "nothing is
 * generating" rather than as an error.
 */
export async function fetchActiveRuns(
  supabase: SupabaseClient<Database>,
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

  if (error) {
    console.error('[generation] active runs query failed:', error.message)
    return []
  }

  return data.map((row) => ({
    id: row.id,
    clientName: formatClientName(row.clients.name),
    targetCount: row.target_count ?? 0,
    doneCount: row.generation_themes.reduce((sum, theme) => sum + (theme.post_count ?? 0), 0),
    startedAt: row.created_at ?? new Date().toISOString(),
  }))
}

/**
 * Fetches theme descriptions from recent generation runs for a client.
 * Used to extend post history so the research pipeline avoids re-suggesting
 * themes that were already generated (but not yet in post_history).
 * A failed read is logged and answers no themes: generation still runs on an empty history and
 * only loses the guard against re-suggesting a theme, which downstream reads as the model
 * repeating itself rather than as a query that failed.
 */
export async function fetchThemeDescriptions(
  supabase: SupabaseClient<Database>,
  clientId: string,
  limit = 10
): Promise<string[]> {
  const { data, error } = await supabase
    .from('generation_runs')
    .select('generation_themes(theme_description)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error(`[generation] theme history query failed for client ${clientId}:`, error.message)
    return []
  }

  return data.flatMap((run) =>
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
  runId: string,
  theme: {
    description: string
    isPriority?: boolean
    brief?: string
    targetDate?: string
    sourceExcerpt?: string
  },
  postCount: number
): Promise<void> {
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

/** `skipped_pillars` as stored: the names, keeping only the strings among them, and the cost. */
const storedSkippedPillarsSchema = z.object({
  names: z
    .array(z.unknown())
    .transform((names) => names.filter((name): name is string => typeof name === 'string')),
  cost: z.number(),
})

/**
 * The stored jsonb as the app's shape, or null for anything else.
 *
 * `skipped_pillars` is written by one function and read by one, but it is still a column the
 * generated types describe as `Json` — a run closed before the column existed, or by an older
 * deploy, comes back as null, and a malformed value must read as "nothing to say" rather than
 * render a banner about undefined pillars.
 */
function toSkippedPillars(value: Json): SkippedPillars | null {
  const parsed = storedSkippedPillarsSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

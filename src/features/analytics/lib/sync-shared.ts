import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { GraphApiError } from '@/lib/meta/graph-errors'
import { notify } from '@/lib/notifications/notify'
import {
  SOCIAL_CONNECTION_SYNC_COLUMNS,
  type SyncableConnection,
} from '@/lib/queries/select-columns'

/**
 * What the two nightly metric syncs share — extracted when Facebook's arrived (2026-09-06).
 *
 * This first drew the line at "everything except the loop", on the reasoning that a shared loop
 * over two networks' PHASES would be a network branch waiting to happen. That reasoning still
 * holds and is still honoured — the phases stay per network, and `runSyncPhases` never learns
 * what a phase is for. But it was applied one level too high: the ROSTER loop around the phases
 * turned out to contain no phase logic at all, only the failure ladder, and the two copies of it
 * were identical for thirty-five lines apart from a platform string, a display name and which
 * per-client function to call. `syncRoster` takes those three and owns the ladder.
 *
 * So: what is shared is everything that must not drift between the networks — the outcome
 * vocabulary, the roster read, the failure ladder, the phase isolation, the sync-health stamp
 * and the notification copy. What is not is what a network actually fetches.
 */

export interface MetricsSyncOutcome {
  synced: number
  skipped: number
  failed: number
  errors: Array<{ clientId: string; error: string }>
}

/**
 * Conditions that make every remaining phase pointless: a dead token, a
 * missing permission, or a rate limit answers the same way for all of them.
 * Anything narrower belongs to its own phase.
 */
function isAccountWideFailure(err: unknown): boolean {
  return (
    err instanceof GraphApiError &&
    (err.failure === 'token_invalid' ||
      err.failure === 'permission' ||
      err.failure === 'rate_limited')
  )
}

export interface SyncPhase {
  name: string
  run: () => Promise<void>
}

/**
 * Every live connection on one network, synced one client at a time, with the failure ladder
 * both nightly runs answer to.
 *
 * The ladder, in order: a time budget checked BETWEEN clients, never inside one, so a client
 * either syncs whole or not at all; a connection with no `client_id` counted and skipped rather
 * than dropped silently, because it can be neither synced nor reported and a row like that is a
 * data problem worth seeing in the totals; a dead token or missing permission notifying the
 * agency and moving on; one rate-limit answer ending the run, since it poisons every remaining
 * call and is self-healing by tomorrow — a stored verdict, no alert; and anything else notifying
 * that the sync did not finish, because otherwise a half-failing sync is invisible: the page
 * still renders, just with sections quietly frozen.
 *
 * `recordSyncHealth` runs on both outcomes. The verdict outlives the run — the page used to date
 * itself from the day rows, a stamp the on-demand refill also wrote, and so called a sync current
 * while a phase had been failing nightly.
 */
export async function syncRoster(
  admin: SupabaseClient,
  options: {
    /** The network as `social_connections.platform` stores it. */
    platform: string
    /** The network's display name, for the copy that asks someone to reconnect. */
    networkLabel: string
    timeBudgetMs: number
    syncOne: (connection: SyncableConnection & { client_id: string }) => Promise<void>
  }
): Promise<MetricsSyncOutcome> {
  const { platform, networkLabel, timeBudgetMs, syncOne } = options
  const startedAt = Date.now()
  const outcome: MetricsSyncOutcome = { synced: 0, skipped: 0, failed: 0, errors: [] }

  const { data, error } = await admin
    .from('social_connections')
    .select(SOCIAL_CONNECTION_SYNC_COLUMNS)
    .eq('platform', platform)
    .not('access_token', 'is', null)
    .not('account_id', 'is', null)
  if (error) throw new Error(`${platform} connection roster query failed: ${error.message}`)
  // WHY as: the shared SupabaseClient param is untyped, so the projection does not infer.
  const connections = (data ?? []) as SyncableConnection[]

  const noteNotifyFailure = (clientId: string, err: unknown) =>
    outcome.errors.push({
      clientId,
      error: `notify failed: ${err instanceof Error ? err.message : 'unknown'}`,
    })

  for (const [index, connection] of connections.entries()) {
    if (Date.now() - startedAt > timeBudgetMs) {
      outcome.skipped += connections.length - index
      break
    }
    const { client_id: clientId } = connection
    if (!clientId) {
      outcome.failed++
      outcome.errors.push({ clientId: connection.account_id, error: 'connection has no client_id' })
      continue
    }
    try {
      await syncOne({ ...connection, client_id: clientId })
      outcome.synced++
      await recordSyncHealth(admin, clientId, platform, null)
    } catch (err) {
      outcome.failed++
      const message = err instanceof Error ? err.message : 'unknown error'
      outcome.errors.push({ clientId, error: message })
      await recordSyncHealth(admin, clientId, platform, message)
      if (err instanceof GraphApiError) {
        if (err.failure === 'token_invalid' || err.failure === 'permission') {
          try {
            await notifyMetricsBlocked(admin, clientId, networkLabel)
          } catch (notifyErr) {
            noteNotifyFailure(clientId, notifyErr)
          }
          continue
        }
        if (err.failure === 'rate_limited') {
          outcome.skipped += connections.length - index - 1
          break
        }
      }
      try {
        await notifySyncIncomplete(admin, clientId)
      } catch (notifyErr) {
        noteNotifyFailure(clientId, notifyErr)
      }
    }
  }
  return outcome
}

/**
 * Runs each phase even when an earlier one failed, and returns what broke.
 * Account-wide failures propagate immediately — retrying more phases
 * against a dead token only burns calls. Callers decide what a partial run
 * means; this never decides for them by swallowing.
 */
export async function runSyncPhases(phases: SyncPhase[]): Promise<string[]> {
  const failures: string[] = []
  for (const { name, run } of phases) {
    try {
      await run()
    } catch (err) {
      if (isAccountWideFailure(err)) throw err
      failures.push(`${name}: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }
  return failures
}

/**
 * Stores what a run concluded about one connection (migration 20260828).
 * Best-effort by design and in both directions: a health write must never
 * turn a good sync bad, and until the migration lands everywhere the missing
 * columns simply mean the page keeps its old, quieter behaviour.
 */
async function recordSyncHealth(
  admin: SupabaseClient,
  clientId: string,
  platform: string,
  error: string | null
): Promise<void> {
  try {
    const { error: writeError } = await admin
      .from('social_connections')
      .update({ last_sync_at: new Date().toISOString(), last_sync_error: error })
      .eq('client_id', clientId)
      .eq('platform', platform)
    if (writeError) throw new Error(writeError.message)
  } catch (err) {
    console.error(`[metrics] sync-health write failed for client ${clientId}:`, err)
  }
}

/**
 * The half-failure alert. Deliberately phrase-stable rather than naming the
 * failing phase: the message IS the dedup key, so a wording that changes with
 * the error would re-notify every night. The phase detail lives in
 * last_sync_error, which the analytics document reads.
 */
function notifySyncIncomplete(admin: SupabaseClient, clientId: string): Promise<void> {
  return notify(admin, {
    clientId,
    message: (name) =>
      `Analytics for ${name} did not finish syncing — some sections are out of date`,
  })
}

/**
 * Tell the agency a metrics sync is blocked on a dead or underscoped connection.
 * `networkLabel` is the display name of the network whose token is dead — naming Instagram
 * over a Facebook failure sends people to reconnect the wrong account.
 */
function notifyMetricsBlocked(
  admin: SupabaseClient,
  clientId: string,
  networkLabel: string
): Promise<void> {
  return notify(admin, {
    clientId,
    message: (name) =>
      `${networkLabel} metrics for ${name} could not be synced — please reconnect the account`,
  })
}

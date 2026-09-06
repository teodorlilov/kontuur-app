import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { GraphApiError } from '@/lib/meta/graph-errors'
import { notify } from '@/lib/notifications/notify'

/**
 * What the two nightly metric syncs share — extracted when Facebook's arrived (2026-09-06).
 *
 * The LOOP itself is deliberately not here: each sync copies the sequential,
 * budget-between-clients, stop-on-rate-limit shape on purpose (the same blessing the comments
 * sync records), because a shared loop over two networks' phases is a network branch waiting
 * to happen. What IS shared is everything that must not drift: the outcome vocabulary, the
 * phase isolation, the sync-health stamp, and the notification copy.
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
export function isAccountWideFailure(err: unknown): boolean {
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
export async function recordSyncHealth(
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
export function notifySyncIncomplete(admin: SupabaseClient, clientId: string): Promise<void> {
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
export function notifyMetricsBlocked(
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

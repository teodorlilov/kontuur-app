import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Erasure of everything Instagram told us about one account, for one client.
 *
 * Two callers need exactly this and nothing else: Meta's mandated data-deletion
 * callback, and the OAuth callback when a client is repointed at a DIFFERENT
 * account. Neither can lean on the `clients` cascade — no client row is being
 * deleted in either case — and before this function nothing in the codebase
 * issued a DELETE against the three ig_* tables at all, which is why an account
 * switch left rows that every read hid (`.eq('ig_account_id', …)`) and no code
 * path could reach.
 *
 * Deliberately NOT used by `deleteClient`: the four tables cascade from
 * `clients` (20260822, 20260823), and re-implementing that here in TypeScript
 * is precisely what its docblock refuses to do.
 *
 * The admin client is required rather than preferred. All four tables carry RLS
 * `for all` policies keyed on `auth.uid()`, and the data-deletion callback runs
 * with no session at all — a user-scoped client would delete zero rows and
 * report no error, which is the worst possible outcome for a deletion path.
 *
 * Throws on the first failing table, naming it. Callers are boundaries and log.
 */
export async function purgeAccountAnalytics(
  admin: SupabaseClient,
  clientId: string,
  accountId: string,
  options?: { includeUnstampedReports?: boolean }
): Promise<void> {
  const scoped = (table: string) =>
    admin.from(table).delete().eq('client_id', clientId).eq('ig_account_id', accountId)

  const [accountRes, postRes, snapshotRes, reportRes, unstampedRes] = await Promise.all([
    scoped('ig_account_metrics'),
    scoped('ig_post_metrics'),
    scoped('ig_audience_snapshots'),
    scoped('analytics_reports'),
    // analytics_reports.ig_account_id is nullable where the ig_* columns are
    // NOT NULL (20260826): archived deliverables predating account stamping
    // kept NULL on purpose. A plain `.eq` therefore strands them, invisible to
    // the account-scoped archive list and unreachable by `deleteReport`. A
    // legal erasure has to sweep them; an account switch must not, because a
    // NULL row cannot be proven to belong to the account being left.
    // A second statement rather than `.or()`: the account id comes from Meta,
    // and it is not going anywhere near a PostgREST filter string.
    options?.includeUnstampedReports
      ? admin.from('analytics_reports').delete().eq('client_id', clientId).is('ig_account_id', null)
      : Promise.resolve({ error: null }),
  ])

  // Every table is attempted before anything throws — a partial purge is better
  // than one that stops at the first failure and leaves three tables untouched.
  const failures = [
    { table: 'ig_account_metrics', error: accountRes.error },
    { table: 'ig_post_metrics', error: postRes.error },
    { table: 'ig_audience_snapshots', error: snapshotRes.error },
    { table: 'analytics_reports', error: reportRes.error },
    { table: 'analytics_reports (unstamped)', error: unstampedRes.error },
  ].filter((result) => result.error !== null)

  if (failures.length > 0) {
    const detail = failures.map((f) => `${f.table}: ${f.error?.message}`).join('; ')
    throw new Error(`analytics purge failed: ${detail}`)
  }
}

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Erasure of everything a network told us about one account, for one client.
 *
 * Three callers need exactly this and nothing else: Meta's mandated data-deletion callback, the
 * Instagram OAuth callback when a client is repointed at a different account, and — since
 * 2026-09-07 — `connectFacebookPage` for the same reason. Facebook's connect path had never
 * called it, so repointing a client at a different Page left that Page's rows behind exactly as
 * an Instagram switch used to: hidden from every account-scoped read and reachable by nothing.
 * None of the three can lean on the `clients` cascade, because no client row is being deleted.
 *
 * The account id may therefore be an Instagram account OR a Facebook Page. That is safe because
 * the id spaces do not overlap: a Page id matches no ig_* row and an Instagram account id
 * matches no fb_page_metrics row, so each caller's network simply finds its own tables and the
 * other lines are no-ops.
 *
 * Deliberately NOT used by `deleteClient`: every table here cascades from
 * `clients` (20260822, 20260823, 20260846), and re-implementing that in
 * TypeScript is precisely what its docblock refuses to do.
 *
 * The admin client is required rather than preferred. All these tables carry RLS
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
  // Every delete is written out. A shared `scoped` helper stood here and only two of the seven
  // calls could use it: the other five carry a different account column, and three had to say so
  // in a comment explaining that the helper would fail on an unknown column — which is how one of
  // them shipped broken once. A helper the majority must refuse is not a helper.
  //
  // Writing `.from('table')` literally also lets `npm run writers` SEE these deletes, so three
  // tables no longer need a registry entry that is exempt from the staleness check.
  const [accountRes, postRes, snapshotRes, reportRes, commentRes, unstampedRes, fbPageRes] =
    await Promise.all([
      admin
        .from('ig_account_metrics')
        .delete()
        .eq('client_id', clientId)
        .eq('ig_account_id', accountId),
      // `platform_account_id`, not `ig_account_id`: this table renamed the column when it became
      // network-neutral (20260845). Getting that wrong is how it shipped broken once, caught by
      // the 2026-09 audit.
      admin
        .from('platform_post_metrics')
        .delete()
        .eq('client_id', clientId)
        .eq('platform_account_id', accountId),
      admin
        .from('ig_audience_snapshots')
        .delete()
        .eq('client_id', clientId)
        .eq('ig_account_id', accountId),
      // `platform_account_id`: the archive renamed the column when Facebook reports joined it
      // (20260847).
      admin
        .from('analytics_reports')
        .delete()
        .eq('client_id', clientId)
        .eq('platform_account_id', accountId),
      // Comments are the one table here holding data about people who are not the
      // agency and not its client — the audience. That makes this line the part of
      // Meta's data-deletion callback that actually erases third parties, and the
      // reason it is a line here rather than a second purge function.
      // `platform_account_id`: like platform_post_metrics above, this table renamed the column
      // when it became network-neutral (20260844) — on the one path in this file whose failure
      // is a legal problem rather than a stale chart.
      admin
        .from('platform_comments')
        .delete()
        .eq('client_id', clientId)
        .eq('platform_account_id', accountId),
      // analytics_reports.ig_account_id is nullable where the ig_* columns are
      // NOT NULL (20260826): archived deliverables predating account stamping
      // kept NULL on purpose. A plain `.eq` therefore strands them, invisible to
      // the account-scoped archive list and unreachable by `deleteReport`. A
      // legal erasure has to sweep them; an account switch must not, because a
      // NULL row cannot be proven to belong to the account being left.
      // A second statement rather than `.or()`: the account id comes from Meta,
      // and it is not going anywhere near a PostgREST filter string.
      options?.includeUnstampedReports
        ? admin
            .from('analytics_reports')
            .delete()
            .eq('client_id', clientId)
            .is('platform_account_id', null)
        : Promise.resolve({ error: null }),
      // Facebook's daily Page series — its own table by design (20260846), so its own line.
      // The id spaces partition: a Page id only ever matches Facebook rows.
      admin.from('fb_page_metrics').delete().eq('client_id', clientId).eq('page_id', accountId),
    ])

  // Every table is attempted before anything throws — a partial purge is better
  // than one that stops at the first failure and leaves three tables untouched.
  const failures = [
    { table: 'ig_account_metrics', error: accountRes.error },
    { table: 'platform_post_metrics', error: postRes.error },
    { table: 'ig_audience_snapshots', error: snapshotRes.error },
    { table: 'analytics_reports', error: reportRes.error },
    { table: 'platform_comments', error: commentRes.error },
    { table: 'analytics_reports (unstamped)', error: unstampedRes.error },
    { table: 'fb_page_metrics', error: fbPageRes.error },
  ].filter((result) => result.error !== null)

  if (failures.length > 0) {
    const detail = failures.map((f) => `${f.table}: ${f.error?.message}`).join('; ')
    throw new Error(`analytics purge failed: ${detail}`)
  }
}

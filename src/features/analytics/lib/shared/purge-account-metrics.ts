import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Erasure of everything a network told us about one account, for one client.
 *
 * Three callers: Meta's mandated data-deletion callback, the Instagram OAuth callback, and
 * `connectFacebookPage` — the last two when a client is repointed at a different account, which
 * overwrites the connection row in place and makes the outgoing account's rows unreachable by
 * every account-scoped read. None of the three can lean on the `clients` cascade, because no
 * client row is being deleted.
 *
 * The account id may be an Instagram account OR a Page, and nothing below filters on platform.
 * That holds only while one Meta id never names both: a Page id must match no ig_* row and an
 * Instagram account id no fb_page_metrics row, leaving those lines as no-ops for the other
 * network. `api/meta/data-deletion` makes the same bet on its `social_connections` delete.
 *
 * THE ACCOUNT COLUMN DIFFERS PER TABLE, and it is the live hazard: `ig_account_id` on the two
 * ig_* tables, `page_id` on `fb_page_metrics` (20260846), `platform_account_id` on the three
 * renamed when they went network-neutral (`platform_comments` 20260844,
 * `platform_post_metrics` 20260845, `analytics_reports` 20260847). Getting one wrong shipped
 * broken: this purge failed `platform_post_metrics` on every run and no gate saw it. Hence no
 * shared `scoped(table)` helper — `.eq` is typed per table, and a literal `.from('table')` is
 * also the only thing `npm run writers` can see.
 *
 * `includeUnstampedReports` additionally sweeps archive rows whose `platform_account_id` is NULL
 * (20260826 left pre-stamp deliverables that way): the account-scoped delete strands them, and
 * `fetchReportArchive` filters on the account, so no list `deleteReport` is reachable from ever
 * shows them. A legal erasure has to take them; an account switch must not, because a NULL row
 * cannot be proven to belong to the account being left. Two statements rather than `.or()` — the
 * account id comes from Meta, and it is not going anywhere near a PostgREST filter string.
 *
 * `platform_comments` is the one table here holding data about people who are neither the agency
 * nor its client — the audience. That is what makes it a line in this function rather than a
 * second purge, and the part of Meta's callback that actually erases third parties.
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
 * Throws once every table has been attempted, naming each failure. Callers are boundaries and log.
 */
export async function purgeAccountAnalytics(
  admin: SupabaseClient,
  clientId: string,
  accountId: string,
  options?: { includeUnstampedReports?: boolean }
): Promise<void> {
  const [accountRes, postRes, snapshotRes, reportRes, commentRes, unstampedRes, fbPageRes] =
    await Promise.all([
      admin
        .from('ig_account_metrics')
        .delete()
        .eq('client_id', clientId)
        .eq('ig_account_id', accountId),
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
      admin
        .from('analytics_reports')
        .delete()
        .eq('client_id', clientId)
        .eq('platform_account_id', accountId),
      admin
        .from('platform_comments')
        .delete()
        .eq('client_id', clientId)
        .eq('platform_account_id', accountId),
      options?.includeUnstampedReports
        ? admin
            .from('analytics_reports')
            .delete()
            .eq('client_id', clientId)
            .is('platform_account_id', null)
        : Promise.resolve({ error: null }),
      admin.from('fb_page_metrics').delete().eq('client_id', clientId).eq('page_id', accountId),
    ])

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

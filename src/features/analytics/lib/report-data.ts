import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchIgConnectionState } from '@/lib/queries/db'
import {
  IG_ACCOUNT_METRIC_COLUMNS,
  IG_AUDIENCE_SNAPSHOT_COLUMNS,
  type IGAudienceSnapshotColumns,
  IG_POST_METRIC_COLUMNS,
  PUBLISHED_POST_PIN_COLUMNS,
  type IGAccountMetricColumns,
  type IGPostMetricColumns,
  type PublishedPostPin,
} from '@/lib/queries/select-columns'
import { shiftDateKey, zonedTimeToInstant } from '@/utils/date-helpers'
import { buildAnalyticsReport, type AnalyticsReportData } from './build-report'
import type { AnalyticsPeriod } from './period'

/**
 * The comparison console's one data read: stored tables in Postgres, assembled
 * by build-report, cached in the Data Cache until the nightly metrics cron
 * revalidates the tag. The request path makes zero Graph API calls — that is
 * the whole point of the tables.
 *
 * Ownership is the caller's job: the page validates the client id against the
 * agency roster before this admin-client read runs (the parseParam pattern
 * every dashboard page uses).
 */

/** Revalidated by /api/cron/metrics after each nightly sync. */
export const IG_METRICS_TAG = 'ig-metrics'

/** The nothing-attributable report: day-one shape, no history claimed. */
function emptyReport(period: AnalyticsPeriod, timezone: string): AnalyticsReportData {
  return buildAnalyticsReport({
    period,
    accountRows: [],
    postRows: [],
    publishedPosts: [],
    currentSnapshot: null,
    previousSnapshot: null,
    timezone,
    hasHistory: false,
    lastSyncAt: null,
  })
}

const _fetchAnalyticsReport = unstable_cache(
  async (
    clientId: string,
    // Part of the cache key on purpose: a reconnect changes the account id
    // and must never serve the previous account's cached report.
    accountId: string,
    preset: AnalyticsPeriod['preset'],
    start: string,
    end: string,
    prevStart: string,
    prevEnd: string,
    days: number,
    timezone: string,
    // Passed in, not derived here: this used to be max(fetched_at) over the day
    // rows, which the on-demand refill also stamped. It now comes from the
    // cron's own verdict, and being an argument makes it part of the cache key —
    // a fresh sync yields a fresh report rather than waiting on the tag.
    lastSyncAt: string | null
  ): Promise<AnalyticsReportData> => {
    const admin = createAdminSupabaseClient()
    const period: AnalyticsPeriod = { preset, start, end, prevStart, prevEnd, days }

    // Post timestamps are instants; the period is agency-calendar days.
    const postedFrom = zonedTimeToInstant(start, '00:00', timezone).toISOString()
    const postedTo = zonedTimeToInstant(shiftDateKey(end, 1), '00:00', timezone).toISOString()
    // Reaches back over the comparison window too: the trend chart draws both
    // lines, so it must be able to say which posts moved the previous one.
    // The builder splits them — only current-window rows reach the table.
    const postedFromPrev = zonedTimeToInstant(prevStart, '00:00', timezone).toISOString()

    // INVARIANT: this report never shows another account's data. Every store
    // it reads — metrics, posts ledger, snapshots — records the client, but a
    // client can be reconnected to a different Instagram account. So every
    // query below claims ONLY rows stamped (migrations 20260825/20260826)
    // with the account id this client is connected to right now.
    //
    // The rows this hides no longer outlive the switch: the OAuth callback
    // purges the superseded account's metrics, snapshots and stamped reports
    // (purge-account-metrics.ts). Unreachable rows were never a history, and
    // nothing could delete them. Published posts DO survive — they are the
    // agency's own ledger, so the pin below still filters rather than assumes.
    const [accountRes, postRes, publishedRes, snapshotRes, latestRes] = await Promise.all([
      admin
        .from('ig_account_metrics')
        .select(IG_ACCOUNT_METRIC_COLUMNS)
        .eq('client_id', clientId)
        .eq('ig_account_id', accountId)
        .gte('metric_date', prevStart)
        .lte('metric_date', end)
        .order('metric_date'),
      admin
        .from('ig_post_metrics')
        .select(IG_POST_METRIC_COLUMNS)
        .eq('client_id', clientId)
        .eq('ig_account_id', accountId)
        .gte('posted_at', postedFromPrev)
        .lt('posted_at', postedTo),
      // Kontuur's own ledger: pins posts the sync cannot see — removed from Instagram
      // after publishing, or published since the last sync ran.
      //
      // Reads publications, not posts: "published to Instagram, at this time, as this
      // media" is one destination's fact. The old form filtered posts on a status and a
      // platform they no longer carry, and needed a case-insensitive compare because the
      // two tables spell a platform differently — a publication already speaks the
      // connection's lowercase vocabulary, so that mismatch is gone with it.
      admin
        .from('post_publications')
        .select(`external_post_id, published_at, posts!inner(${PUBLISHED_POST_PIN_COLUMNS})`)
        .eq('platform', 'instagram')
        .eq('account_id', accountId)
        .eq('status', 'published')
        .eq('posts.client_id', clientId)
        .gte('published_at', postedFrom)
        .lt('published_at', postedTo),
      admin
        .from('ig_audience_snapshots')
        .select(IG_AUDIENCE_SNAPSHOT_COLUMNS)
        .eq('client_id', clientId)
        .eq('ig_account_id', accountId)
        // A snapshot dated D is taken the morning after and describes the
        // audience through D−1 — so a window ending E may use a snapshot
        // dated E+1. Without the +1, today's snapshot never matches any
        // window (they all end yesterday) and the section sits empty.
        .lte('snapshot_date', shiftDateKey(end, 1))
        .order('snapshot_date', { ascending: false })
        .limit(12),
      // Existence only — "has any day ever been captured for this account".
      admin
        .from('ig_account_metrics')
        .select('metric_date')
        .eq('client_id', clientId)
        .eq('ig_account_id', accountId)
        .limit(1),
    ])
    for (const res of [accountRes, postRes, publishedRes, snapshotRes, latestRes]) {
      if (res.error) throw new Error(`analytics report read failed: ${res.error.message}`)
    }

    // WHY as: this shared admin client is untyped, so projections do not infer.
    const accountRows = (accountRes.data ?? []) as unknown as IGAccountMetricColumns[]
    const postRows = (postRes.data ?? []) as unknown as IGPostMetricColumns[]
    const publishedPosts = (publishedRes.data ?? []) as unknown as PublishedPostPin[]
    let snapshots = (snapshotRes.data ?? []) as unknown as IGAudienceSnapshotColumns[]
    // No snapshot covers this window (weekly capture may postdate an older
    // period): fall back to the account's LATEST snapshot. The view labels it
    // with its date — audiences drift slowly, and a dated picture beats none.
    if (snapshots.length === 0) {
      const fallback = await admin
        .from('ig_audience_snapshots')
        .select(IG_AUDIENCE_SNAPSHOT_COLUMNS)
        .eq('client_id', clientId)
        .eq('ig_account_id', accountId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
      if (fallback.error) {
        throw new Error(`analytics report read failed: ${fallback.error.message}`)
      }
      snapshots = (fallback.data ?? []) as unknown as IGAudienceSnapshotColumns[]
    }
    const hasHistory = ((latestRes.data ?? []) as unknown[]).length > 0

    const currentSnapshot = snapshots[0] ?? null
    return buildAnalyticsReport({
      period,
      accountRows,
      postRows,
      publishedPosts,
      timezone,
      currentSnapshot,
      // Strictly older than the current one, or the "was" ticks fake a flat period.
      previousSnapshot:
        snapshots.find(
          (row) => row !== currentSnapshot && row.snapshot_date <= shiftDateKey(prevEnd, 1)
        ) ?? null,
      hasHistory,
      lastSyncAt,
    })
  },
  // The key carries a version because the cached VALUE is a whole report
  // object: when its shape grows, entries written by the previous deploy are
  // still served and silently lack the new fields. That is what happened to
  // v3 — reports cached before `details` existed rendered rows with no hover
  // card, and only the windows a reader happened to revisit came back right.
  // Bump this on every shape change; a stale report costs more than a rebuild.
  //
  // v4: reachByDay.thenDate/thenPosts + ComparisonRow.details.
  // v5: ReportPostRow.postedDayKey — posts are bucketed in the agency's clock
  // now, so a v4 entry both lacks the field and pins posts on the wrong day.
  // v6: lastSyncAt is the last CLEAN cron run rather than max(fetched_at), which
  // is what decides whether a post reads "removed" or "pending".
  ['analytics-report-v6'],
  { revalidate: 3600, tags: [IG_METRICS_TAG] }
)

/**
 * Fetches (or serves from cache) the report for one client and period. The
 * connection lookup stays OUTSIDE the cache so the account id is always
 * current — a client with no Instagram connection has nothing attributable
 * to show and gets the day-one report.
 */
export const getAnalyticsReport = cache(
  async (
    clientId: string,
    period: AnalyticsPeriod,
    timezone: string
  ): Promise<AnalyticsReportData> => {
    const { accountId, lastSyncAt, lastSyncError } = await fetchIgConnectionState(
      createAdminSupabaseClient(),
      clientId
    )
    if (!accountId) return emptyReport(period, timezone)

    return _fetchAnalyticsReport(
      clientId,
      accountId,
      period.preset,
      period.start,
      period.end,
      period.prevStart,
      period.prevEnd,
      period.days,
      timezone,
      // Only a run that finished every phase may date this. It gates the
      // "no longer on Instagram" verdict, and the two mistakes are not equal:
      // a false "pending" says come back tomorrow, a false "removed" tells the
      // reader a live post was deleted. A half-failed sync proves nothing about
      // what Instagram still holds, so it dates nothing.
      lastSyncError === null ? lastSyncAt : null
    )
  }
)

import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchIgConnectionState } from '@/lib/queries/db'
import {
  IG_ACCOUNT_METRIC_COLUMNS,
  IG_AUDIENCE_SNAPSHOT_COLUMNS,
  type IGAudienceSnapshotColumns,
  PLATFORM_POST_METRIC_COLUMNS,
  PUBLISHED_POST_PIN_COLUMNS,
  type IGAccountMetricColumns,
  type PlatformPostMetricColumns,
  type PublishedPostPin,
} from '@/lib/queries/select-columns'
import { shiftDateKey } from '@/utils/date-helpers'
import { buildAnalyticsReport, type AnalyticsReportData } from './build-report'
import type { AnalyticsPeriod } from '../compute/period'
import { postedWindow } from '../compute/report-data-shared'

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

/**
 * The cached read behind every report. Its arguments are its cache key, which is why the account
 * id and the sync stamp are passed in rather than looked up inside.
 *
 * INVARIANT: this report never shows another account's data. Every store it reads — metrics,
 * posts ledger, snapshots — records the client, but a client can be reconnected to a different
 * Instagram account, so every query below claims ONLY rows stamped (migration 20260826) with the
 * account this client is connected to right now. The rows this hides do not outlive the switch:
 * the OAuth callback purges the superseded account's metrics, snapshots and stamped reports
 * (shared/purge-account-metrics.ts). Published posts DO survive — they are the agency's own
 * ledger, so the pin filters rather than assumes.
 *
 * Snapshots are claimed one day PAST the window's end: a snapshot dated D is taken the morning
 * after and describes the audience through D−1, so without the +1 today's snapshot matches no
 * window (they all end yesterday) and the audience section sits empty.
 *
 * BUMP THE KEY PREFIX ON EVERY SHAPE CHANGE. The cached VALUE is a whole report object, so
 * entries written by the previous deploy keep being served and silently lack whatever field was
 * just added — a row rendering without its hover card until someone revisits that window.
 *
 * WHY as: the admin client is constructed without the `Database` generic, so no projection in
 * here infers — every read below narrows through an assertion to the shape select-columns names.
 */
const _fetchAnalyticsReport = unstable_cache(
  async (
    clientId: string,
    accountId: string,
    preset: AnalyticsPeriod['preset'],
    start: string,
    end: string,
    prevStart: string,
    prevEnd: string,
    days: number,
    timezone: string,
    lastSyncAt: string | null
  ): Promise<AnalyticsReportData> => {
    const admin = createAdminSupabaseClient()
    const period: AnalyticsPeriod = { preset, start, end, prevStart, prevEnd, days }

    const posted = postedWindow(period, timezone)

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
        .from('platform_post_metrics')
        .select(PLATFORM_POST_METRIC_COLUMNS)
        .eq('client_id', clientId)
        .eq('platform_account_id', accountId)
        .gte('posted_at', posted.fromPrevious)
        .lt('posted_at', posted.to),
      admin
        .from('post_publications')
        .select(`external_post_id, published_at, posts!inner(${PUBLISHED_POST_PIN_COLUMNS})`)
        .eq('platform', 'instagram')
        .eq('account_id', accountId)
        .eq('status', 'published')
        .eq('posts.client_id', clientId)
        .gte('published_at', posted.from)
        .lt('published_at', posted.to),
      admin
        .from('ig_audience_snapshots')
        .select(IG_AUDIENCE_SNAPSHOT_COLUMNS)
        .eq('client_id', clientId)
        .eq('ig_account_id', accountId)
        .lte('snapshot_date', shiftDateKey(end, 1))
        .order('snapshot_date', { ascending: false })
        .limit(12),
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

    const accountRows = (accountRes.data ?? []) as unknown as IGAccountMetricColumns[]
    const postRows = (postRes.data ?? []) as unknown as PlatformPostMetricColumns[]
    const publishedPosts = (publishedRes.data ?? []) as unknown as PublishedPostPin[]
    let snapshots = (snapshotRes.data ?? []) as unknown as IGAudienceSnapshotColumns[]
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
      previousSnapshot:
        snapshots.find(
          (row) => row !== currentSnapshot && row.snapshot_date <= shiftDateKey(prevEnd, 1)
        ) ?? null,
      hasHistory,
      lastSyncAt,
    })
  },
  ['analytics-report-v7'],
  { revalidate: 3600, tags: [IG_METRICS_TAG] }
)

/**
 * Fetches (or serves from cache) the report for one client and period. The
 * connection lookup stays OUTSIDE the cache so the account id is always
 * current — a client with no Instagram connection has nothing attributable
 * to show and gets the day-one report.
 *
 * Only a sync that finished every phase may date the report. That stamp gates the "no longer on
 * Instagram" verdict, and the two mistakes are not equal: a false "pending" says come back
 * tomorrow, a false "removed" tells the reader a live post was deleted. A half-failed sync proves
 * nothing about what Instagram still holds, so it dates nothing.
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
      lastSyncError === null ? lastSyncAt : null
    )
  }
)

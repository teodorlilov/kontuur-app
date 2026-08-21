import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchCurrentIgAccountId } from '@/lib/queries/db'
import {
  IG_ACCOUNT_METRIC_COLUMNS,
  IG_AUDIENCE_SNAPSHOT_COLUMNS,
  IG_POST_METRIC_COLUMNS,
  PUBLISHED_POST_PIN_COLUMNS,
  type IGAccountMetricColumns,
  type IGPostMetricColumns,
  type PublishedPostPinColumns,
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

interface SnapshotRow {
  snapshot_date: string
  follower_demographics: unknown
  engaged_audience_demographics: unknown
}

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
    timezone: string
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
      // Kontuur's own ledger: pins posts the sync cannot see — removed from
      // Instagram after publishing, or published since the last sync ran.
      // posts.platform is canonical display case; compare case-insensitively.
      admin
        .from('posts')
        .select(PUBLISHED_POST_PIN_COLUMNS)
        .eq('client_id', clientId)
        .eq('status', 'published')
        .ilike('platform', 'instagram')
        .eq('ig_account_id', accountId)
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
      admin
        .from('ig_account_metrics')
        .select('metric_date, fetched_at')
        .eq('client_id', clientId)
        .eq('ig_account_id', accountId)
        .order('metric_date', { ascending: false })
        .limit(1),
    ])
    for (const res of [accountRes, postRes, publishedRes, snapshotRes, latestRes]) {
      if (res.error) throw new Error(`analytics report read failed: ${res.error.message}`)
    }

    // WHY as: this shared admin client is untyped, so projections do not infer.
    const accountRows = (accountRes.data ?? []) as unknown as IGAccountMetricColumns[]
    const postRows = (postRes.data ?? []) as unknown as IGPostMetricColumns[]
    const publishedPosts = (publishedRes.data ?? []) as unknown as PublishedPostPinColumns[]
    let snapshots = (snapshotRes.data ?? []) as unknown as SnapshotRow[]
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
      snapshots = (fallback.data ?? []) as unknown as SnapshotRow[]
    }
    const latest = (latestRes.data ?? []) as unknown as Array<{
      metric_date: string
      fetched_at: string
    }>

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
      hasHistory: latest.length > 0,
      lastSyncAt: latest[0]?.fetched_at ?? null,
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
  ['analytics-report-v5'],
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
    const accountId = await fetchCurrentIgAccountId(createAdminSupabaseClient(), clientId)
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
      timezone
    )
  }
)

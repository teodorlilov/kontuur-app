import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
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

const _fetchAnalyticsReport = unstable_cache(
  async (
    clientId: string,
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

    const [accountRes, postRes, publishedRes, snapshotRes, latestRes] = await Promise.all([
      admin
        .from('ig_account_metrics')
        .select(IG_ACCOUNT_METRIC_COLUMNS)
        .eq('client_id', clientId)
        .gte('metric_date', prevStart)
        .lte('metric_date', end)
        .order('metric_date'),
      admin
        .from('ig_post_metrics')
        .select(IG_POST_METRIC_COLUMNS)
        .eq('client_id', clientId)
        .gte('posted_at', postedFrom)
        .lt('posted_at', postedTo),
      // Kontuur's own ledger: pins posts the sync cannot see — deleted from
      // Instagram after publishing, or published since the last sync ran.
      // posts.platform is canonical display case; compare case-insensitively.
      admin
        .from('posts')
        .select(PUBLISHED_POST_PIN_COLUMNS)
        .eq('client_id', clientId)
        .eq('status', 'published')
        .ilike('platform', 'instagram')
        .gte('published_at', postedFrom)
        .lt('published_at', postedTo),
      admin
        .from('ig_audience_snapshots')
        .select(IG_AUDIENCE_SNAPSHOT_COLUMNS)
        .eq('client_id', clientId)
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
    const snapshots = (snapshotRes.data ?? []) as unknown as SnapshotRow[]
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
  ['analytics-report'],
  { revalidate: 3600, tags: [IG_METRICS_TAG] }
)

/** Fetches (or serves from cache) the report for one client and period. */
export const getAnalyticsReport = cache(
  (clientId: string, period: AnalyticsPeriod, timezone: string): Promise<AnalyticsReportData> =>
    _fetchAnalyticsReport(
      clientId,
      period.preset,
      period.start,
      period.end,
      period.prevStart,
      period.prevEnd,
      period.days,
      timezone
    )
)

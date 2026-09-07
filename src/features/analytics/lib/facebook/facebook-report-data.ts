import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchConnectionSyncState } from '@/lib/queries/db'
import {
  FB_PAGE_METRIC_COLUMNS,
  PLATFORM_POST_METRIC_COLUMNS,
  PUBLISHED_POST_PIN_COLUMNS,
  type FbPageMetricColumns,
  type PlatformPostMetricColumns,
  type PublishedPostPin,
} from '@/lib/queries/select-columns'
import { buildFacebookReport, type FacebookReportData } from './build-facebook-report'
import type { AnalyticsPeriod } from '../compute/period'
import { postedWindow } from '../compute/report-data-shared'

/**
 * The Facebook report's read layer — the thin sibling of `report-data.ts`, holding to its
 * rules: the request path reads Postgres and nothing else; every read is scoped by the
 * account (Page) the client is connected to RIGHT NOW; the connection lookup stays outside
 * the data cache so a reconnect can never serve the previous Page's cached report.
 */

/** Revalidated by /api/cron/metrics after each nightly Facebook capture. */
export const FB_METRICS_TAG = 'fb-metrics'

/** The nothing-attributable report: day-one shape, no history claimed. */
function emptyReport(period: AnalyticsPeriod, timezone: string): FacebookReportData {
  return buildFacebookReport({
    period,
    pageRows: [],
    postRows: [],
    publishedPosts: [],
    timezone,
    hasHistory: false,
    lastSyncAt: null,
  })
}

const _fetchFacebookReport = unstable_cache(
  async (
    clientId: string,
    // Part of the cache key on purpose: repointing a client at a different Page must never
    // serve the previous Page's cached report.
    pageId: string,
    preset: AnalyticsPeriod['preset'],
    start: string,
    end: string,
    prevStart: string,
    prevEnd: string,
    days: number,
    timezone: string,
    // The cron's own verdict, passed in so it keys the cache — a fresh sync yields a fresh
    // report rather than waiting on the tag.
    lastSyncAt: string | null
  ): Promise<FacebookReportData> => {
    const admin = createAdminSupabaseClient()
    const period: AnalyticsPeriod = { preset, start, end, prevStart, prevEnd, days }

    // Post timestamps are instants; the period is agency-calendar days.
    const {
      from: postedFrom,
      to: postedTo,
      fromPrevious: postedFromPrev,
    } = postedWindow(period, timezone)

    const [pageRes, postRes, publishedRes, historyRes] = await Promise.all([
      admin
        .from('fb_page_metrics')
        .select(FB_PAGE_METRIC_COLUMNS)
        .eq('client_id', clientId)
        .eq('page_id', pageId)
        .gte('metric_date', prevStart)
        .lte('metric_date', end)
        .order('metric_date'),
      admin
        .from('platform_post_metrics')
        .select(PLATFORM_POST_METRIC_COLUMNS)
        .eq('client_id', clientId)
        .eq('platform', 'facebook')
        .eq('platform_account_id', pageId)
        .gte('posted_at', postedFromPrev)
        .lt('posted_at', postedTo),
      // Kontuur's own ledger: pins posts the sync cannot see — removed from the Page after
      // publishing, or published since the last sync ran. The mirror of Instagram's pin, which
      // it was written as and finally is: bounded at the CURRENT window's start.
      //
      // It used to be bounded at `postedFromPrev`, reaching back a whole extra period. Those
      // publications matched none of the current window's metric rows, so each was pushed with
      // every measure null and — its publish time being far past the sync grace — labelled
      // `missing: 'removed'`. A 30-day Facebook window rendered every post from the preceding
      // 30 days as "no longer on Facebook", all columns "—", and counted them in the footer.
      admin
        .from('post_publications')
        .select(`external_post_id, published_at, posts!inner(${PUBLISHED_POST_PIN_COLUMNS})`)
        .eq('platform', 'facebook')
        .eq('account_id', pageId)
        .eq('status', 'published')
        .eq('posts.client_id', clientId)
        .gte('published_at', postedFrom)
        .lt('published_at', postedTo),
      admin
        .from('fb_page_metrics')
        .select('metric_date')
        .eq('client_id', clientId)
        .eq('page_id', pageId)
        .limit(1),
    ])
    for (const res of [pageRes, postRes, publishedRes, historyRes]) {
      if (res.error) throw new Error(`facebook report read failed: ${res.error.message}`)
    }

    // WHY as: this shared admin client is untyped, so projections do not infer.
    const pageRows = (pageRes.data ?? []) as unknown as FbPageMetricColumns[]
    const postRows = (postRes.data ?? []) as unknown as PlatformPostMetricColumns[]
    const publishedPosts = (publishedRes.data ?? []) as unknown as PublishedPostPin[]
    const hasHistory = ((historyRes.data ?? []) as unknown[]).length > 0

    return buildFacebookReport({
      period,
      pageRows,
      postRows,
      publishedPosts,
      timezone,
      hasHistory,
      lastSyncAt,
    })
  },
  ['facebook-report-v1'],
  { revalidate: 3600, tags: [FB_METRICS_TAG] }
)

/**
 * Fetches (or serves from cache) the Facebook report for one client and period. A client
 * with no Facebook connection has nothing attributable to show and gets the day-one report.
 */
export const getFacebookAnalyticsReport = cache(
  async (
    clientId: string,
    period: AnalyticsPeriod,
    timezone: string
  ): Promise<FacebookReportData> => {
    const { accountId, lastSyncAt, lastSyncError } = await fetchConnectionSyncState(
      createAdminSupabaseClient(),
      clientId,
      'facebook'
    )
    if (!accountId) return emptyReport(period, timezone)

    return _fetchFacebookReport(
      clientId,
      accountId,
      period.preset,
      period.start,
      period.end,
      period.prevStart,
      period.prevEnd,
      period.days,
      timezone,
      // Only a run that finished every phase may date this — it gates the posts table's
      // "removed" vs "pending" verdict, exactly as on the Instagram side.
      lastSyncError === null ? lastSyncAt : null
    )
  }
)

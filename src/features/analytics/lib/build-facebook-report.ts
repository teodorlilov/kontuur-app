import type {
  FbPageMetricColumns,
  PlatformPostMetricColumns,
  PublishedPostPin,
} from '@/lib/queries/select-columns'
import { periodDayKeys, type AnalyticsPeriod } from './period'
import {
  alignRows,
  buildDailyTrend,
  buildFollowerSummary,
  buildPosts,
  dailyValues,
  dayKeyOf,
  groupTrendPostsByDay,
  median,
  previousTrendPostsByDay,
  stripCell,
  sumOrNull,
  type FollowerSummary,
  type ReachDay,
  type ReportPostRow,
  type StripCell,
} from './report-sections'

/**
 * Pure assembly of the Facebook report: stored rows in, one renderable document out — the
 * thin sibling of `buildAnalyticsReport`, composing the same section math from
 * `report-sections.ts` rather than copying any of it.
 *
 * It is thin because Meta left Pages thin (probed, docs/META-FB-PROBE.md): no reach or
 * impressions at either level, no demographics, no follower-online hours. The sections those
 * would feed simply do not exist on this shape — a composition that does not include a
 * section never has to fake it.
 */

export interface FacebookReportData {
  period: AnalyticsPeriod
  /** False until the first sync has written any Page row — the day-one state. */
  hasHistory: boolean
  lastSyncAt: string | null
  followersTotal: number | null
  /** page_post_engagements — the closest thing a Page has to "interactions". */
  engagements: StripCell
  /** page_views_total — people looking at the Page itself. */
  pageViews: StripCell
  followers: FollowerSummary
  /** Engagements day by day, with post pins — the ReachDay shape ReachTrend renders. */
  engagementByDay: ReachDay[]
  posts: ReportPostRow[]
  /** Median of per-post total interactions — the ranking basis, since per-post reach is dead. */
  medianInteractions: number | null
}

export interface BuildFacebookReportInput {
  period: AnalyticsPeriod
  /** Rows spanning prevStart..end — the builder splits them. */
  pageRows: FbPageMetricColumns[]
  /** Facebook posts published inside the fetched span, as the sync captured them. */
  postRows: PlatformPostMetricColumns[]
  /** Kontuur's own published ledger for the same window — fills what the sync cannot see. */
  publishedPosts: PublishedPostPin[]
  timezone: string
  hasHistory: boolean
  lastSyncAt: string | null
}

/** Assembles everything the Facebook report renders from the stored rows. */
export function buildFacebookReport(input: BuildFacebookReportInput): FacebookReportData {
  const { period } = input
  const currentKeys = periodDayKeys(period.start, period.days)
  const previousKeys = periodDayKeys(period.prevStart, period.days)
  // No pre-filter: `alignRows` selects by EXACT day key, so a row outside the window is never
  // picked up and filtering first only walks the array twice more for the same answer.
  const current = alignRows(input.pageRows, currentKeys)
  const previous = alignRows(input.pageRows, previousKeys)

  const engagements = stripCell(current, previous, (row) => row.post_engagements)
  const pageViews = stripCell(current, previous, (row) => row.page_views)

  // Only current-window rows feed the table; the previous window's rows exist to pin the
  // comparison line — the same split the Instagram builder makes.
  const currentPostRows = input.postRows.filter((row) => {
    const date = dayKeyOf(row.posted_at, input.timezone)
    return date === null || date >= period.start
  })
  const { posts } = buildPosts(
    currentPostRows,
    input.publishedPosts,
    input.lastSyncAt,
    input.timezone
  )
  /**
   * Re-ranked by interactions: `buildPosts` orders by reach, which every Facebook row lacks
   * (Meta serves none). Re-sorting the composed result keeps the ranking rule out of the
   * shared function — a rank parameter there would be a mode two networks must agree on.
   */
  posts.sort((a, b) => (b.interactions ?? -1) - (a.interactions ?? -1))
  const medianInteractions = median(
    currentPostRows
      .map((row) => row.total_interactions)
      .filter((value): value is number => value !== null)
  )

  const postsByDate = groupTrendPostsByDay(posts)
  const previousPostsByDate = previousTrendPostsByDay(
    input.postRows,
    period.prevEnd,
    input.timezone
  )

  const engagementByDay = buildDailyTrend({
    currentKeys,
    previousKeys,
    nowSeries: engagements.series,
    thenSeries: dailyValues(previous, (row) => row.post_engagements),
    // The tooltip's second lens on a day: how many people looked at the Page itself.
    secondarySeries: pageViews.series,
    postsByDate,
    previousPostsByDate,
  })

  const { followers, followersTotal } = buildFollowerSummary({
    current,
    previous,
    currentKeys,
    followsOf: (row) => row.follows,
    unfollowsOf: (row) => row.unfollows,
    followersCountOf: (row) => row.followers_count,
    postsByDate,
    // Facebook attributes no per-post follows (the metric died with the purge); every post
    // carries null and the sum is honestly null.
    fromPosts: sumOrNull(posts.map((post) => post.follows)),
  })

  return {
    period,
    hasHistory: input.hasHistory,
    lastSyncAt: input.lastSyncAt,
    followersTotal,
    engagements,
    pageViews,
    followers,
    engagementByDay,
    posts,
    medianInteractions,
  }
}

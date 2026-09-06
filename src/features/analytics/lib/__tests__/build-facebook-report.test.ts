import { describe, expect, it } from 'vitest'
import type {
  FbPageMetricColumns,
  PlatformPostMetricColumns,
  PublishedPostPin,
} from '@/lib/queries/select-columns'
import {
  buildFacebookReport,
  type BuildFacebookReportInput,
} from '../facebook/build-facebook-report'
import type { AnalyticsPeriod } from '../compute/period'
import { postMetricRow } from './fixtures'

/**
 * The Facebook document's assembly — what `npm run check` cannot see. The builder composes
 * report-sections' shared math, so what these pin is the COMPOSITION: which column feeds
 * which section, the interactions ranking that replaces the dead reach ranking, and the
 * NULL contract surviving the trip.
 */

/** A 3-day period (Sep 4–6) against the 3 days before it (Sep 1–3). */
const PERIOD: AnalyticsPeriod = {
  preset: 'custom',
  start: '2026-09-04',
  end: '2026-09-06',
  prevStart: '2026-09-01',
  prevEnd: '2026-09-03',
  days: 3,
}

function pageRow(overrides: Partial<FbPageMetricColumns>): FbPageMetricColumns {
  return {
    metric_date: '2026-09-04',
    followers_count: null,
    follows: null,
    unfollows: null,
    post_engagements: null,
    page_views: null,
    ...overrides,
  }
}

function postRow(overrides: Partial<PlatformPostMetricColumns>): PlatformPostMetricColumns {
  // A Page post id and a publish instant; Meta serves no media type for these.
  return postMetricRow({
    external_post_id: '723701000827665_1',
    posted_at: '2026-09-04T12:00:00Z',
    ...overrides,
  })
}

function input(overrides: Partial<BuildFacebookReportInput>): BuildFacebookReportInput {
  return {
    period: PERIOD,
    pageRows: [],
    postRows: [],
    publishedPosts: [] as PublishedPostPin[],
    timezone: 'UTC',
    hasHistory: true,
    lastSyncAt: '2026-09-06T03:30:00Z',
    ...overrides,
  }
}

describe('buildFacebookReport', () => {
  it('feeds engagements and page views into the strip, split across the two windows', () => {
    const report = buildFacebookReport(
      input({
        pageRows: [
          pageRow({ metric_date: '2026-09-02', post_engagements: 5, page_views: 10 }),
          pageRow({ metric_date: '2026-09-04', post_engagements: 3, page_views: 7 }),
          pageRow({ metric_date: '2026-09-05', post_engagements: 4 }),
        ],
      })
    )
    expect(report.engagements.now).toBe(7)
    expect(report.engagements.then).toBe(5)
    expect(report.pageViews.now).toBe(7)
    expect(report.pageViews.then).toBe(10)
    // The NULL contract: a day the API skipped is a gap, never a zero.
    expect(report.engagements.series).toEqual([3, 4, null])
  })

  it('anchors the follower curve on the level and tells the flow story', () => {
    const report = buildFacebookReport(
      input({
        pageRows: [
          pageRow({ metric_date: '2026-09-04', followers_count: 64, follows: 2, unfollows: 1 }),
          pageRow({ metric_date: '2026-09-05', follows: 1, unfollows: 0 }),
        ],
      })
    )
    expect(report.followers.gained.now).toBe(3)
    expect(report.followers.lost.now).toBe(1)
    expect(report.followers.net.now).toBe(2)
    // Day 2 has no captured level; the anchored walk derives it from day 1's 64 + net 1.
    expect(report.followers.series).toEqual([64, 65, null])
    expect(report.followersTotal).toBe(64)
  })

  it('ranks posts by interactions, because per-post reach is dead for Pages', () => {
    const report = buildFacebookReport(
      input({
        postRows: [
          postRow({ external_post_id: 'p_quiet', total_interactions: 1, like_count: 1 }),
          postRow({
            external_post_id: 'p_loud',
            total_interactions: 8,
            like_count: 5,
            comments_count: 2,
            shares: 1,
          }),
        ],
      })
    )
    expect(report.posts.map((post) => post.igMediaId)).toEqual(['p_loud', 'p_quiet'])
    expect(report.posts[0]!.likeCount).toBe(5)
    expect(report.posts[0]!.shares).toBe(1)
    expect(report.medianInteractions).toBe(4.5)
    // What Meta does not serve stays null on every row — never zero.
    expect(report.posts[0]!.reach).toBeNull()
    expect(report.posts[0]!.follows).toBeNull()
  })

  it('pairs the engagement trend with the previous window and pins publish days', () => {
    const report = buildFacebookReport(
      input({
        pageRows: [
          pageRow({ metric_date: '2026-09-01', post_engagements: 9 }),
          pageRow({ metric_date: '2026-09-04', post_engagements: 3 }),
        ],
        postRows: [postRow({ posted_at: '2026-09-04T09:00:00Z', total_interactions: 2 })],
      })
    )
    const first = report.engagementByDay[0]!
    expect(first.date).toBe('2026-09-04')
    expect(first.now).toBe(3)
    expect(first.thenDate).toBe('2026-09-01')
    expect(first.then).toBe(9)
    expect(first.posts).toHaveLength(1)
  })
})

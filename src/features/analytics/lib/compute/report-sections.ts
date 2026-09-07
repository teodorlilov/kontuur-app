import type { PlatformPostMetricColumns, PublishedPostPin } from '@/lib/queries/select-columns'
import { toDateKey } from '@/utils/date-helpers'
import { parseTimestamp } from '@/utils/format'

/**
 * The section math BOTH networks' report builders compose from — extracted from
 * `build-report.ts` when Facebook analytics arrived (2026-09-06), because the alternative was
 * either copying this logic into a second builder or teaching one builder a network branch.
 *
 * Everything here is network-neutral BY CONSTRUCTION: generic over any daily row carrying
 * `metric_date`, fed values through picker functions, and never naming a platform. Instagram
 * feeds `stripCell` reach; Facebook feeds it page views — the function cannot tell.
 *
 * The probe's rule travels through unchanged: NULL means "the API had nothing for this day",
 * 0 means it said zero. Sums are null only when EVERY day was null; deltas are null whenever
 * either side can't be computed.
 */

// ── Output shapes ──

export interface ComparisonValue {
  now: number | null
  then: number | null
  /** Percent change vs the previous period; null when either side is unknowable. */
  deltaPct: number | null
}

export interface StripCell extends ComparisonValue {
  /** One entry per day of the current period; null = the API had nothing. */
  series: Array<number | null>
}

/**
 * Why a post row has no metrics: 'pending' = the nightly sync has not run
 * since it published; 'removed' = a completed sync no longer found it on
 * the network (deleted after publish). Null = the metrics are real.
 */
export type PostMissing = 'pending' | 'removed' | null

/** The slice of a post the trend tooltip names — enough to answer "what caused this". */
export interface TrendPost {
  /** The network's own id for the post — `platform_post_metrics.external_post_id`. */
  externalPostId: string
  caption: string | null
  mediaType: string | null
  reach: number | null
  /**
   * Carried because a network may have no per-post reach at all: Meta's 2025-11-15 purge left
   * Facebook Pages without it, so a card that can only speak reach has nothing to say about a
   * Facebook post and used to promise the number was still coming.
   */
  interactions: number | null
  follows: number | null
  missing: PostMissing
}

export interface ReachDay {
  date: string
  now: number | null
  then: number | null
  /**
   * The previous-period day this column's `then` value actually came from.
   * The two windows share one axis, so without naming it the reader reads
   * "13 Aug · previous 3,948" and assumes both numbers describe 13 Aug.
   */
  thenDate: string
  /** That day's views — the tooltip pairs the two ways a day was seen. Null when unmeasured. */
  views: number | null
  /** Posts published that day, strongest first. */
  posts: TrendPost[]
  /** Posts published on the previous-period day — what moved THAT line. */
  thenPosts: TrendPost[]
}

export interface FollowerFlowDay {
  date: string
  gained: number | null
  lost: number | null
  /** Posts published that day — the flow timeline pins and names them like the reach chart. */
  posts: TrendPost[]
}

export interface FollowerSummary {
  gained: ComparisonValue
  lost: ComparisonValue
  net: { now: number | null; then: number | null }
  /** Latest known account total, not a period sum. */
  total: number | null
  /** followers_count by day for the sparkline. */
  series: Array<number | null>
  /** Day-by-day gains and losses — the flow timeline. */
  byDay: FollowerFlowDay[]
  /** Follows the network itself attributes to this period's posts (per-media metric). */
  fromPosts: number | null
  /** Losses as a share of the followers the period started with. */
  churnPct: number | null
}

export interface ReportPostRow {
  externalPostId: string
  postId: string | null
  caption: string | null
  postedAt: string | null
  /**
   * The agency-calendar day this post belongs to — the same clock the period's
   * day keys are resolved in. Null when the row carries no timestamp.
   */
  postedDayKey: string | null
  mediaType: string | null
  mediaProductType: string | null
  permalink: string | null
  thumbnailUrl: string | null
  reach: number | null
  views: number | null
  interactions: number | null
  saved: number | null
  follows: number | null
  profileVisits: number | null
  likeCount: number | null
  commentsCount: number | null
  shares: number | null
  /** reach ÷ median reach, when both are known. */
  medianRatio: number | null
  missing: PostMissing
}

// ── Small pure helpers ──

/**
 * A value against the period's median, or null when the comparison cannot be made.
 *
 * Guarded on three things, all of which matter: an unmeasured value has no ratio, a period with
 * no median has nothing to compare against, and a median of zero would divide to Infinity and
 * render as "Infinity× median". Instagram rates reach this way and Facebook interactions — the
 * measure differs, the rule does not, and the Facebook table used to keep its own copy.
 */
export function ratioToMedian(value: number | null, median: number | null): number | null {
  if (value === null || median === null || median <= 0) return null
  return value / median
}

/** Sum honoring the NULL contract: null only when every input was null. */
export function sumOrNull(values: Array<number | null>): number | null {
  let sum: number | null = null
  for (const value of values) {
    if (value === null) continue
    sum = (sum ?? 0) + value
  }
  return sum
}

/** Percent change, null when the comparison is unknowable (missing or zero base). */
export function deltaPct(now: number | null, then: number | null): number | null {
  if (now === null || then === null || then === 0) return null
  return ((now - then) / then) * 100
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Neither network serves historical follower TOTALS reliably — the nightly sync captures one
 * per night, so a fresh account has few points and no curve. But every day's gains and losses
 * are stored, and one known total anchors the rest: walk outward from each captured count
 * applying the daily net change. Days whose gains are unknown stay null — the line breaks
 * honestly.
 */
function deriveFollowerCurve(
  counts: Array<number | null>,
  gains: Array<number | null>,
  losses: Array<number | null>
): Array<number | null> {
  const curve = [...counts]
  for (let i = curve.length - 1; i > 0; i--) {
    if (curve[i] !== null && curve[i - 1] === null && gains[i] !== null && gains[i] !== undefined) {
      curve[i - 1] = curve[i]! - (gains[i]! - (losses[i] ?? 0))
    }
  }
  for (let i = 0; i < curve.length - 1; i++) {
    if (
      curve[i] !== null &&
      curve[i + 1] === null &&
      gains[i + 1] !== null &&
      gains[i + 1] !== undefined
    ) {
      curve[i + 1] = curve[i]! + (gains[i + 1]! - (losses[i + 1] ?? 0))
    }
  }
  return curve
}

// ── Day alignment ──

/** A period's rows, index-aligned to its day keys; missing dates are null. */
interface DayAlignedRows<Row> {
  byDay: Array<Row | null>
}

/** Generic over the daily-row shape: each network's table qualifies by carrying metric_date. */
export function alignRows<Row extends { metric_date: string }>(
  rows: Row[],
  dayKeys: string[]
): DayAlignedRows<Row> {
  const byDate = new Map(rows.map((row) => [row.metric_date, row]))
  return { byDay: dayKeys.map((key) => byDate.get(key) ?? null) }
}

export function dailyValues<Row, T>(
  period: DayAlignedRows<Row>,
  pick: (row: Row) => T | null
): Array<T | null> {
  return period.byDay.map((row) => (row ? pick(row) : null))
}

export function stripCell<Row>(
  current: DayAlignedRows<Row>,
  previous: DayAlignedRows<Row>,
  pick: (row: Row) => number | null
): StripCell {
  const series = dailyValues(current, pick)
  const now = sumOrNull(series)
  const then = sumOrNull(dailyValues(previous, pick))
  return { now, then, deltaPct: deltaPct(now, then), series }
}

// ── Posts table ──

/** A sync this much newer than a publish had every chance to see the media. */
const SYNC_GRACE_MS = 60 * 60 * 1000

const APP_MEDIA_TYPE: Record<string, string> = { carousel: 'CAROUSEL_ALBUM' }

/**
 * The agency-calendar day a timestamp falls on. The period's day keys are
 * resolved in the agency's clock, so reading the UTC prefix off an instant put
 * every post published in the first hours of local morning one column early —
 * and, on the window's opening day, pushed it out of the window altogether, so
 * a live post arrived through the ledger arm instead and was labelled as no
 * longer on the network.
 */
export function dayKeyOf(iso: string | null, timezone: string): string | null {
  if (!iso) return null
  // parseTimestamp, not `new Date(iso)`: posts.published_at is a naive UTC
  // timestamp, which JS would otherwise read in the runtime's zone.
  const date = parseTimestamp(iso)
  return Number.isNaN(date.getTime()) ? null : toDateKey(date, timezone)
}

/**
 * The posts table plus its median: synced rows first, then Kontuur's own ledger filling what
 * the sync cannot see — posts the network no longer reports (deleted after publish) or has not
 * synced yet. A post the metrics table already covers defers to that richer row.
 */
export function buildPosts(
  postRows: PlatformPostMetricColumns[],
  publishedPosts: PublishedPostPin[],
  lastSyncAt: string | null,
  timezone: string,
  /**
   * The current window's first day. Pins outside it are dropped.
   *
   * This file has always CLAIMED that "the app ledger's pins are scoped to the current window"
   * (see previousTrendPostsByDay), but only the callers' queries enforced it — and Facebook's
   * bounded its ledger read at the PREVIOUS window's start, so every publication from the
   * comparison window arrived here, matched none of the current window's metric rows, and was
   * pushed with every measure null and a "removed" verdict. A 30-day Facebook window showed the
   * preceding 30 days of posts as deleted from the Page. The query is fixed; the invariant is
   * enforced here so a third network cannot rediscover it.
   */
  periodStart: string
): {
  posts: ReportPostRow[]
  medianReach: number | null
} {
  const medianReach = median(
    postRows.map((row) => row.reach).filter((reach): reach is number => reach !== null)
  )
  const posts: ReportPostRow[] = postRows.map((row) => ({
    externalPostId: row.external_post_id,
    postId: row.post_id,
    caption: row.caption,
    postedAt: row.posted_at,
    postedDayKey: dayKeyOf(row.posted_at, timezone),
    mediaType: row.media_type,
    mediaProductType: row.media_product_type,
    permalink: row.permalink,
    thumbnailUrl: row.thumbnail_url,
    reach: row.reach,
    views: row.views,
    interactions: row.total_interactions,
    saved: row.saved,
    follows: row.follows,
    profileVisits: row.profile_visits,
    likeCount: row.like_count,
    commentsCount: row.comments_count,
    shares: row.shares,
    medianRatio: ratioToMedian(row.reach, medianReach),
    missing: null as PostMissing,
  }))

  const knownMedia = new Set(postRows.map((row) => row.external_post_id))
  const knownPostIds = new Set(postRows.map((row) => row.post_id))
  for (const publication of publishedPosts) {
    const post = publication.posts
    if (!publication.published_at) continue
    // Current window only — the pin fills what the sync could not see for THIS period, not a
    // post the reader is looking at the comparison line for.
    const pinnedDay = dayKeyOf(publication.published_at, timezone)
    if (!pinnedDay || pinnedDay < periodStart) continue
    if (publication.external_post_id && knownMedia.has(publication.external_post_id)) continue
    if (knownPostIds.has(post.id)) continue
    const syncSawIt =
      lastSyncAt !== null &&
      parseTimestamp(lastSyncAt).getTime() - parseTimestamp(publication.published_at).getTime() >
        SYNC_GRACE_MS
    posts.push({
      externalPostId: publication.external_post_id ?? `post-${post.id}`,
      postId: post.id,
      caption: post.caption,
      postedAt: publication.published_at,
      postedDayKey: pinnedDay,
      mediaType: APP_MEDIA_TYPE[post.post_type ?? ''] ?? 'IMAGE',
      mediaProductType: null,
      permalink: null,
      thumbnailUrl: null,
      reach: null,
      views: null,
      interactions: null,
      saved: null,
      follows: null,
      profileVisits: null,
      likeCount: null,
      commentsCount: null,
      shares: null,
      medianRatio: null,
      missing: syncSawIt ? 'removed' : 'pending',
    })
  }

  posts.sort((a, b) => (b.reach ?? -1) - (a.reach ?? -1))
  return { posts, medianReach }
}

// ── Trend pins ──

/**
 * Publications keyed by calendar day; `buildPosts` already ordered them strongest first, so
 * each day's list keeps that order.
 */
export function groupTrendPostsByDay(posts: ReportPostRow[]): Map<string, TrendPost[]> {
  const postsByDate = new Map<string, TrendPost[]>()
  for (const post of posts) {
    const date = post.postedDayKey
    if (!date) continue
    const list = postsByDate.get(date) ?? []
    list.push({
      externalPostId: post.externalPostId,
      caption: post.caption,
      mediaType: post.mediaType,
      reach: post.reach,
      interactions: post.interactions,
      follows: post.follows,
      missing: post.missing,
    })
    postsByDate.set(date, list)
  }
  return postsByDate
}

/**
 * The previous window's publications, from synced metrics only — the app ledger's pins are
 * scoped to the current window, so a previous-period post the network never returned simply
 * has no pin rather than a guessed one.
 */
export function previousTrendPostsByDay(
  postRows: PlatformPostMetricColumns[],
  prevEnd: string,
  timezone: string
): Map<string, TrendPost[]> {
  const previousPostsByDate = new Map<string, TrendPost[]>()
  for (const row of postRows) {
    const date = dayKeyOf(row.posted_at, timezone)
    if (!date || date > prevEnd) continue
    const list = previousPostsByDate.get(date) ?? []
    list.push({
      externalPostId: row.external_post_id,
      caption: row.caption,
      mediaType: row.media_type,
      reach: row.reach,
      interactions: row.total_interactions,
      follows: row.follows,
      missing: null,
    })
    previousPostsByDate.set(date, list)
  }
  for (const list of previousPostsByDate.values()) {
    list.sort((a, b) => (b.reach ?? -1) - (a.reach ?? -1))
  }
  return previousPostsByDate
}

/**
 * The compared daily trend: one row per current-period day, paired with the previous-period
 * day sharing its axis position. Instagram feeds reach (with views riding as the secondary
 * series); Facebook feeds post engagements with no secondary — this function never knows
 * which.
 */
export function buildDailyTrend(args: {
  currentKeys: string[]
  previousKeys: string[]
  nowSeries: Array<number | null>
  thenSeries: Array<number | null>
  /** The tooltip's second lens on a day (Instagram's views). All-null when there is none. */
  secondarySeries: Array<number | null>
  postsByDate: Map<string, TrendPost[]>
  previousPostsByDate: Map<string, TrendPost[]>
}): ReachDay[] {
  return args.currentKeys.map((date, index) => {
    const thenDate = args.previousKeys[index] ?? date
    return {
      date,
      now: args.nowSeries[index] ?? null,
      then: args.thenSeries[index] ?? null,
      thenDate,
      views: args.secondarySeries[index] ?? null,
      posts: args.postsByDate.get(date) ?? [],
      thenPosts: args.previousPostsByDate.get(thenDate) ?? [],
    }
  })
}

// ── Follower summary ──

/**
 * The whole follower story — gained/lost/net, the anchored curve, the flow timeline, churn —
 * from whichever columns a network stores its counts in. `fromPosts` is the per-media follows
 * the network attributes to the period's posts; a network that serves none passes posts whose
 * follows are all null and gets an honest null back.
 */
export function buildFollowerSummary<Row>(args: {
  current: DayAlignedRows<Row>
  previous: DayAlignedRows<Row>
  currentKeys: string[]
  followsOf: (row: Row) => number | null
  unfollowsOf: (row: Row) => number | null
  followersCountOf: (row: Row) => number | null
  postsByDate: Map<string, TrendPost[]>
  /** Per-post follows summed by the caller (it holds the posts); null when unserved. */
  fromPosts: number | null
}): { followers: FollowerSummary; followersTotal: number | null } {
  const gainedSeries = dailyValues(args.current, args.followsOf)
  const lostSeries = dailyValues(args.current, args.unfollowsOf)
  const gained: ComparisonValue = {
    now: sumOrNull(gainedSeries),
    then: sumOrNull(dailyValues(args.previous, args.followsOf)),
    deltaPct: null,
  }
  gained.deltaPct = deltaPct(gained.now, gained.then)
  const lost: ComparisonValue = {
    now: sumOrNull(lostSeries),
    then: sumOrNull(dailyValues(args.previous, args.unfollowsOf)),
    deltaPct: null,
  }
  lost.deltaPct = deltaPct(lost.now, lost.then)
  const net = {
    now: gained.now === null && lost.now === null ? null : (gained.now ?? 0) - (lost.now ?? 0),
    then: gained.then === null && lost.then === null ? null : (gained.then ?? 0) - (lost.then ?? 0),
  }
  const followerCounts = dailyValues(args.current, args.followersCountOf)
  const followersTotal = [...followerCounts].reverse().find((value) => value !== null) ?? null
  const followerCurve = deriveFollowerCurve(followerCounts, gainedSeries, lostSeries)

  const byDay: FollowerFlowDay[] = args.currentKeys.map((date, index) => ({
    date,
    gained: gainedSeries[index]!,
    lost: lostSeries[index]!,
    posts: args.postsByDate.get(date) ?? [],
  }))

  // Followers at the period's start: the first anchored end-of-day total
  // minus that day's own net change. Null when the curve never anchors.
  const startTotal =
    followerCurve[0] !== null && followerCurve[0] !== undefined
      ? followerCurve[0] - (gainedSeries[0] ?? 0) + (lostSeries[0] ?? 0)
      : null
  const churnPct =
    lost.now !== null && startTotal !== null && startTotal > 0
      ? (lost.now / startTotal) * 100
      : null

  return {
    followers: {
      gained,
      lost,
      net,
      total: followersTotal,
      series: followerCurve,
      byDay,
      fromPosts: args.fromPosts,
      churnPct,
    },
    followersTotal,
  }
}

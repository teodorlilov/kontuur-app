import type { PlatformPostMetricColumns, PublishedPostPin } from '@/lib/queries/select-columns'
import { toDateKey } from '@/utils/date-helpers'
import { parseTimestamp } from '@/utils/format'

/**
 * The section math BOTH networks' report builders compose from, in place of a second copy or a
 * network branch inside one builder.
 *
 * Network-neutral BY CONSTRUCTION: generic over any daily row carrying `metric_date`, fed
 * values through picker functions, and never naming a platform. Instagram feeds `stripCell`
 * reach, Facebook feeds it page views — the function cannot tell.
 *
 * The probe's rule travels through unchanged (sync-metrics.ts): NULL means "the API had nothing
 * for this day", 0 means it said zero. Sums are null only when EVERY day was null; deltas are
 * null whenever either side can't be computed.
 */

// ── Output shapes ──

export interface ComparisonValue {
  now: number | null
  then: number | null
  deltaPct: number | null
}

export interface StripCell extends ComparisonValue {
  /** One entry per day of the current period; null = the API had nothing. */
  series: Array<number | null>
}

/**
 * Why a post row has no metrics: 'pending' = no clean sync has run since it published;
 * 'removed' = one has, and did not find it on the network. Null = the metrics are real.
 */
export type PostMissing = 'pending' | 'removed' | null

/** The slice of a post the trend tooltip names — enough to answer "what caused this". */
export interface TrendPost {
  externalPostId: string
  caption: string | null
  mediaType: string | null
  reach: number | null
  /**
   * Carried because a network may have no per-post reach at all — Meta's 2025-11-15 purge left
   * Facebook Pages without it (lib/meta/facebook/insights.ts). A card that can only speak reach
   * has nothing true to say about a Facebook post.
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
  /** The day's second lens — Instagram's views, Facebook's page views. Null when unmeasured. */
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
  /** The anchored curve from `deriveFollowerCurve`, not raw counts — feeds the strip sparkline. */
  series: Array<number | null>
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
  /** The agency-calendar day this post belongs to — the clock the period's day keys use. */
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
 * All three guards matter: an unmeasured value has no ratio, a period with no median has nothing
 * to compare against, and a median of zero would divide to Infinity and render as "Infinity×
 * median". Instagram rates reach this way, Facebook interactions — the measure differs, the rule
 * does not.
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
 * Instagram serves no historical follower TOTALS: `followers_count` is a reading of the account
 * as it stands, which only the nightly run can take (sync-metrics.ts), so a window holds one
 * point per night it ran and a fresh account has no curve. Every day's gains and losses ARE
 * stored, though, and one known total anchors the rest — walk outward from each captured count
 * applying the daily net change. Days whose gains are unknown stay null, so the line breaks
 * honestly rather than interpolating.
 *
 * Facebook's `page_follows` is a level series per day, so these loops usually have nothing to
 * fill — but `zipPageDays` leaves a metric absent on any day Meta did not serve it, so a day
 * with gains and no level still walks.
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

/** posts.post_type ('single' | 'carousel') in the network vocabulary `postTypeMeta` keys on. */
const APP_MEDIA_TYPE: Record<string, string> = { carousel: 'CAROUSEL_ALBUM' }

/**
 * The agency-calendar day a timestamp falls on.
 *
 * The period's day keys are resolved in the agency's clock, so slicing the UTC prefix off an
 * instant puts every post published in the first hours of local morning one column early — and
 * on the window's opening day, out of the window altogether, whereupon the ledger arm re-adds
 * it as a pin marked "removed": a live post reported as deleted. build-report.test.ts pins the
 * Europe/Sofia case that catches this.
 *
 * The instant is read with `parseTimestamp`, which appends Z to a stored timestamp carrying no
 * offset; plain `new Date` would read that same string in the runtime's zone.
 */
export function dayKeyOf(iso: string | null, timezone: string): string | null {
  if (!iso) return null
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
   * The current window's first day. Pins outside it are dropped HERE, not only in the callers'
   * queries: a publication from the comparison window matches none of the current window's
   * metric rows, so it is pushed with every measure null and — its publish time being far past
   * the sync grace — a "removed" verdict. That reads as a whole preceding period of posts
   * deleted from the network. build-facebook-report.test.ts pins it.
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
 * Publications keyed by calendar day, preserving the caller's ranking within each day —
 * Instagram hands these over sorted by reach, Facebook by interactions.
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
 * The previous window's publications, from synced metrics only. The app ledger's pins are scoped
 * to the current window (see `buildPosts`), so a previous-period post the network never returned
 * simply has no pin rather than a guessed one.
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
 * The compared daily trend: one row per current-period day, paired with the previous-period day
 * sharing its axis position. Instagram feeds reach with views as the secondary series, Facebook
 * post engagements with page views — this function never knows which.
 */
export function buildDailyTrend(args: {
  currentKeys: string[]
  previousKeys: string[]
  nowSeries: Array<number | null>
  thenSeries: Array<number | null>
  /** The tooltip's second lens on a day. All-null is legitimate: the row renders without it. */
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
 * from whichever columns a network stores its counts in. `fromPosts` is the network's OWN
 * per-media attribution, a separate basis from the account-level gained total; a network that
 * serves none (Facebook, since the purge) passes all-null follows and gets an honest null back.
 *
 * Churn is measured against the followers the period STARTED with — the anchored curve's first
 * day backed out over its own net change — so it stays null when the curve never anchored.
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

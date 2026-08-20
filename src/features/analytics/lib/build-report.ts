import { z } from 'zod'
import type {
  IGAccountMetricColumns,
  IGPostMetricColumns,
  PublishedPostPinColumns,
} from '@/lib/queries/select-columns'
import { periodDayKeys, type AnalyticsPeriod } from './period'

/**
 * Pure assembly of the comparison console's data: stored rows in, one
 * renderable report out. No network, no Supabase — the server module fetches,
 * this file computes, the components only format.
 *
 * The probe's rule travels through unchanged: NULL means "the API had nothing
 * for this day", 0 means it said zero. Sums are null only when EVERY day was
 * null; deltas are null whenever either side can't be computed.
 */

// ── Stored jsonb shapes (written by sync-metrics; parsed, never asserted) ──

const breakdownMapSchema = z.record(z.string(), z.number())

const demographicsSchema = z.object({
  age: breakdownMapSchema,
  gender: breakdownMapSchema,
  city: breakdownMapSchema,
  country: breakdownMapSchema,
})

export interface AudienceSnapshotInput {
  snapshot_date: string
  follower_demographics: unknown
  engaged_audience_demographics: unknown
}

// ── Output shape ──

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

export interface FollowerSummary {
  gained: ComparisonValue
  lost: ComparisonValue
  net: { now: number | null; then: number | null }
  /** Latest known account total, not a period sum. */
  total: number | null
  /** followers_count by day for the sparkline. */
  series: Array<number | null>
}

export interface EngagementRateCell {
  now: number | null
  then: number | null
  /** Percentage-POINT change, not percent-of-percent. */
  deltaPt: number | null
  series: Array<number | null>
}

export interface ComparisonRow {
  key: string
  label: string
  meta?: string
  now: number | null
  then: number | null
}

/**
 * Why a post row has no metrics: 'pending' = the nightly sync has not run
 * since it published; 'removed' = a completed sync no longer found it on
 * Instagram (deleted after publish). Null = the metrics are real.
 */
export type PostMissing = 'pending' | 'removed' | null

/** The slice of a post the trend tooltip names — enough to answer "what caused this". */
export interface TrendPost {
  igMediaId: string
  caption: string | null
  mediaType: string | null
  reach: number | null
  follows: number | null
  missing: PostMissing
}

export interface ReachDay {
  date: string
  now: number | null
  then: number | null
  /** That day's views — the tooltip pairs the two ways a day was seen. */
  views: number | null
  /** Posts published that day, strongest reach first. */
  posts: TrendPost[]
}

export interface BestDay {
  date: string
  reach: number
  /** Caption of the strongest post published that day, when one exists. */
  caption: string | null
}

export interface AudienceBand {
  band: string
  followerPct: number
  engagedPct: number | null
  prevFollowerPct: number | null
}

export interface AudienceShare {
  label: string
  pct: number
  prevPct: number | null
}

export interface AudienceReport {
  snapshotDate: string
  ages: AudienceBand[]
  genders: AudienceShare[]
  cities: AudienceShare[]
}

export interface ReportPostRow {
  igMediaId: string
  postId: string | null
  caption: string | null
  postedAt: string | null
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
  /** reach ÷ median reach, when both are known. */
  medianRatio: number | null
  missing: PostMissing
}

export interface AnalyticsReportData {
  period: AnalyticsPeriod
  /** False until the first sync has written any account row — the day-one state. */
  hasHistory: boolean
  lastSyncAt: string | null
  followersTotal: number | null
  views: StripCell
  reach: StripCell
  interactions: StripCell
  followers: FollowerSummary
  engagementRate: EngagementRateCell
  reachByDay: ReachDay[]
  bestDay: BestDay | null
  formats: ComparisonRow[]
  interactionKinds: ComparisonRow[]
  profileViews: ComparisonValue
  tapButtons: ComparisonRow[]
  audience: AudienceReport | null
  /** A snapshot exists for this window — audience null then means "under the floor". */
  hasAudienceSnapshot: boolean
  posts: ReportPostRow[]
  medianReach: number | null
}

// ── Small pure helpers ──

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

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** BOOK_NOW → "Book now"; unknown API enums stay readable without a lookup table. */
export function humanizeDimension(key: string): string {
  const lower = key.toLowerCase().replace(/_/g, ' ')
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

function parseBreakdownMap(raw: unknown): Record<string, number> | null {
  if (raw === null || raw === undefined) return null
  const parsed = breakdownMapSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/**
 * Instagram never serves historical follower TOTALS — only the nightly sync
 * captures one per night, so a fresh account has a single point and no curve.
 * But every day's gains and losses are stored, and one known total anchors
 * the rest: walk outward from each captured count applying the daily net
 * change. Days whose gains are unknown stay null — the line breaks honestly.
 */
export function deriveFollowerCurve(
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

/** Sums per-day breakdown maps into one map; null when no day had one. */
function sumBreakdownMaps(
  maps: Array<Record<string, number> | null>
): Record<string, number> | null {
  let total: Record<string, number> | null = null
  for (const map of maps) {
    if (!map) continue
    total ??= {}
    for (const [key, value] of Object.entries(map)) {
      total[key] = (total[key] ?? 0) + value
    }
  }
  return total
}

// ── Assembly ──

interface PeriodRows {
  /** Index-aligned to the period's day keys; missing dates are all-null rows. */
  byDay: Array<IGAccountMetricColumns | null>
}

function alignRows(rows: IGAccountMetricColumns[], dayKeys: string[]): PeriodRows {
  const byDate = new Map(rows.map((row) => [row.metric_date, row]))
  return { byDay: dayKeys.map((key) => byDate.get(key) ?? null) }
}

function dailyValues<T>(
  period: PeriodRows,
  pick: (row: IGAccountMetricColumns) => T | null
): Array<T | null> {
  return period.byDay.map((row) => (row ? pick(row) : null))
}

function stripCell(
  current: PeriodRows,
  previous: PeriodRows,
  pick: (row: IGAccountMetricColumns) => number | null
): StripCell {
  const series = dailyValues(current, pick)
  const now = sumOrNull(series)
  const then = sumOrNull(dailyValues(previous, pick))
  return { now, then, deltaPct: deltaPct(now, then), series }
}

const FORMAT_LABELS: Record<string, string> = {
  // The insights breakdown vocabulary (POST/REEL/AD/…), NOT /media's FEED/REELS.
  POST: 'Posts',
  CAROUSEL_CONTAINER: 'Carousels',
  REEL: 'Reels',
  STORY: 'Stories',
  AD: 'Ads · paid',
}

function comparisonRows(
  nowMap: Record<string, number> | null,
  thenMap: Record<string, number> | null,
  labelFor: (key: string) => string
): ComparisonRow[] {
  const keys = new Set([...Object.keys(nowMap ?? {}), ...Object.keys(thenMap ?? {})])
  const rows: ComparisonRow[] = []
  for (const key of keys) {
    const now = nowMap ? (nowMap[key] ?? 0) : null
    const then = thenMap ? (thenMap[key] ?? 0) : null
    if (!now && !then) continue
    rows.push({ key, label: labelFor(key), now, then })
  }
  return rows.sort((a, b) => (b.now ?? 0) - (a.now ?? 0))
}

function buildAudience(
  current: AudienceSnapshotInput | null,
  previous: AudienceSnapshotInput | null
): AudienceReport | null {
  if (!current) return null
  const follower = demographicsSchema.safeParse(current.follower_demographics)
  if (!follower.success) return null
  const engaged = demographicsSchema.safeParse(current.engaged_audience_demographics)
  const prev = previous ? demographicsSchema.safeParse(previous.follower_demographics) : null

  const pctOf = (map: Record<string, number>): ((key: string) => number | null) => {
    const total = Object.values(map).reduce((sum, count) => sum + count, 0)
    return (key) => (total > 0 && key in map ? (map[key]! / total) * 100 : null)
  }

  const followerAgePct = pctOf(follower.data.age)
  const engagedAgePct = engaged.success ? pctOf(engaged.data.age) : null
  const prevAgePct = prev?.success ? pctOf(prev.data.age) : null

  const ages: AudienceBand[] = Object.keys(follower.data.age)
    .sort()
    .map((band) => ({
      band,
      followerPct: followerAgePct(band) ?? 0,
      engagedPct: engagedAgePct ? engagedAgePct(band) : null,
      prevFollowerPct: prevAgePct ? prevAgePct(band) : null,
    }))

  const GENDER_LABELS: Record<string, string> = { F: 'Women', M: 'Men', U: 'Unspecified' }
  const genderPct = pctOf(follower.data.gender)
  const prevGenderPct = prev?.success ? pctOf(prev.data.gender) : null
  const genders: AudienceShare[] = Object.entries(follower.data.gender)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([key]) => ({
      label: GENDER_LABELS[key] ?? key,
      pct: genderPct(key) ?? 0,
      prevPct: prevGenderPct ? prevGenderPct(key) : null,
    }))

  const cityPct = pctOf(follower.data.city)
  const prevCityPct = prev?.success ? pctOf(prev.data.city) : null
  const cities: AudienceShare[] = Object.entries(follower.data.city)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([name]) => ({
      // City strings arrive localized ("Varna, Varna Province") — keep the city part.
      label: name.split(',')[0]!.trim(),
      pct: cityPct(name) ?? 0,
      prevPct: prevCityPct ? prevCityPct(name) : null,
    }))

  return { snapshotDate: current.snapshot_date, ages, genders, cities }
}

/** Kontuur's post_type vocabulary mapped onto Instagram's media_type chips. */
const APP_MEDIA_TYPE: Record<string, string> = { carousel: 'CAROUSEL_ALBUM' }

/** posts.published_at is a naive UTC timestamp — anchor it before parsing. */
function instantMs(iso: string): number {
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`).getTime()
}

/** A sync this much newer than a publish had every chance to see the media. */
const SYNC_GRACE_MS = 60 * 60 * 1000

function buildPosts(
  postRows: IGPostMetricColumns[],
  publishedPosts: PublishedPostPinColumns[],
  lastSyncAt: string | null
): {
  posts: ReportPostRow[]
  medianReach: number | null
} {
  const medianReach = median(
    postRows.map((row) => row.reach).filter((reach): reach is number => reach !== null)
  )
  const posts: ReportPostRow[] = postRows.map((row) => ({
    igMediaId: row.ig_media_id,
    postId: row.post_id,
    caption: row.caption,
    postedAt: row.posted_at,
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
    medianRatio:
      row.reach !== null && medianReach !== null && medianReach > 0
        ? row.reach / medianReach
        : null,
    missing: null as PostMissing,
  }))

  // Kontuur's own ledger fills what the sync cannot see: posts Instagram no
  // longer reports (deleted after publish) or has not synced yet. A post the
  // metrics table already covers defers to that richer row.
  const knownMedia = new Set(postRows.map((row) => row.ig_media_id))
  const knownPostIds = new Set(postRows.map((row) => row.post_id))
  for (const post of publishedPosts) {
    if (!post.published_at) continue
    if (post.ig_media_id && knownMedia.has(post.ig_media_id)) continue
    if (knownPostIds.has(post.id)) continue
    const syncSawIt =
      lastSyncAt !== null && instantMs(lastSyncAt) - instantMs(post.published_at) > SYNC_GRACE_MS
    posts.push({
      igMediaId: post.ig_media_id ?? `post-${post.id}`,
      postId: post.id,
      caption: post.caption,
      postedAt: post.published_at,
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
      medianRatio: null,
      missing: syncSawIt ? 'removed' : 'pending',
    })
  }

  posts.sort((a, b) => (b.reach ?? -1) - (a.reach ?? -1))
  return { posts, medianReach }
}

export interface BuildReportInput {
  period: AnalyticsPeriod
  /** Rows spanning prevStart..end — the builder splits them. */
  accountRows: IGAccountMetricColumns[]
  /** Posts published inside the current period, as the sync captured them. */
  postRows: IGPostMetricColumns[]
  /**
   * Kontuur's own published ledger for the same window — fills what the sync
   * cannot see. The read layer has already scoped these to the client's
   * CURRENTLY connected account (posts.ig_account_id stamp); rows published
   * to any other account never reach this builder.
   */
  publishedPosts: PublishedPostPinColumns[]
  currentSnapshot: AudienceSnapshotInput | null
  previousSnapshot: AudienceSnapshotInput | null
  hasHistory: boolean
  lastSyncAt: string | null
}

/** Assembles everything the comparison console renders from the stored rows. */
export function buildAnalyticsReport(input: BuildReportInput): AnalyticsReportData {
  const { period } = input
  const currentKeys = periodDayKeys(period.start, period.days)
  const previousKeys = periodDayKeys(period.prevStart, period.days)
  const current = alignRows(
    input.accountRows.filter((row) => row.metric_date >= period.start),
    currentKeys
  )
  const previous = alignRows(
    input.accountRows.filter((row) => row.metric_date <= period.prevEnd),
    previousKeys
  )

  const views = stripCell(current, previous, (row) => row.views)
  const reach = stripCell(current, previous, (row) => row.reach)
  const interactions = stripCell(current, previous, (row) => row.total_interactions)

  const gainedSeries = dailyValues(current, (row) => row.follows)
  const gained: ComparisonValue = {
    now: sumOrNull(gainedSeries),
    then: sumOrNull(dailyValues(previous, (row) => row.follows)),
    deltaPct: null,
  }
  gained.deltaPct = deltaPct(gained.now, gained.then)
  const lost: ComparisonValue = {
    now: sumOrNull(dailyValues(current, (row) => row.unfollows)),
    then: sumOrNull(dailyValues(previous, (row) => row.unfollows)),
    deltaPct: null,
  }
  lost.deltaPct = deltaPct(lost.now, lost.then)
  const net = {
    now: gained.now === null && lost.now === null ? null : (gained.now ?? 0) - (lost.now ?? 0),
    then: gained.then === null && lost.then === null ? null : (gained.then ?? 0) - (lost.then ?? 0),
  }
  const followerCounts = dailyValues(current, (row) => row.followers_count)
  const followersTotal = [...followerCounts].reverse().find((value) => value !== null) ?? null
  const followerCurve = deriveFollowerCurve(
    followerCounts,
    dailyValues(current, (row) => row.follows),
    dailyValues(current, (row) => row.unfollows)
  )

  // Engagement rate: period interactions over period reach, in percent.
  const rateOf = (i: number | null, r: number | null): number | null =>
    i !== null && r !== null && r > 0 ? (i / r) * 100 : null
  const erNow = rateOf(interactions.now, reach.now)
  const erThen = rateOf(interactions.then, reach.then)
  const engagementRate: EngagementRateCell = {
    now: erNow,
    then: erThen,
    deltaPt: erNow !== null && erThen !== null ? erNow - erThen : null,
    series: current.byDay.map((row) => (row ? rateOf(row.total_interactions, row.reach) : null)),
  }

  // Publications keyed by calendar day (the UTC slice of posted_at — the same
  // convention the best-day caption uses); buildPosts already ordered them
  // strongest-reach first, so each day's list keeps that order.
  const { posts, medianReach } = buildPosts(input.postRows, input.publishedPosts, input.lastSyncAt)
  const postsByDate = new Map<string, TrendPost[]>()
  for (const post of posts) {
    const date = post.postedAt?.slice(0, 10)
    if (!date) continue
    const list = postsByDate.get(date) ?? []
    list.push({
      igMediaId: post.igMediaId,
      caption: post.caption,
      mediaType: post.mediaType,
      reach: post.reach,
      follows: post.follows,
      missing: post.missing,
    })
    postsByDate.set(date, list)
  }

  const reachByDay: ReachDay[] = currentKeys.map((date, index) => ({
    date,
    now: reach.series[index]!,
    then: previous.byDay[index] ? previous.byDay[index].reach : null,
    views: views.series[index]!,
    posts: postsByDate.get(date) ?? [],
  }))

  let bestDay: BestDay | null = null
  for (const day of reachByDay) {
    if (day.now !== null && (bestDay === null || day.now > bestDay.reach)) {
      bestDay = { date: day.date, reach: day.now, caption: null }
    }
  }
  if (bestDay) {
    const bestDate = bestDay.date
    const dayPost = posts.find((post) => post.postedAt?.slice(0, 10) === bestDate)
    bestDay.caption = dayPost?.caption ?? null
  }

  const formats = comparisonRows(
    sumBreakdownMaps(
      dailyValues(current, (row) => parseBreakdownMap(row.reach_by_media_product_type))
    ),
    sumBreakdownMaps(
      dailyValues(previous, (row) => parseBreakdownMap(row.reach_by_media_product_type))
    ),
    (key) => FORMAT_LABELS[key] ?? humanizeDimension(key)
  )

  const INTERACTION_LABELS = [
    ['likes', 'Likes'],
    ['comments', 'Comments'],
    ['saves', 'Saves'],
    ['shares', 'Shares'],
    ['replies', 'Replies'],
  ] as const
  // Each kind's share of the period's interactions — the mix is the story
  // (saves and shares are high-intent), not just the counts.
  const shareOfInteractions = (part: number | null): string | undefined => {
    if (part === null || part <= 0 || interactions.now === null || interactions.now <= 0) {
      return undefined
    }
    const pct = (part / interactions.now) * 100
    return pct < 1 ? '<1% of interactions' : `${Math.round(pct)}% of interactions`
  }
  // Sorted by size: these render as shared-scale rows, largest first. A
  // measured zero keeps its row — 0 comments is data, not absence.
  const interactionKinds: ComparisonRow[] = INTERACTION_LABELS.map(([key, label]) => {
    const now = sumOrNull(dailyValues(current, (row) => row[key]))
    const meta = shareOfInteractions(now)
    return {
      key,
      label,
      now,
      then: sumOrNull(dailyValues(previous, (row) => row[key])),
      ...(meta ? { meta } : {}),
    }
  }).sort((a, b) => (b.now ?? -1) - (a.now ?? -1))

  const profileViewsNow = sumOrNull(dailyValues(current, (row) => row.profile_views))
  const profileViewsThen = sumOrNull(dailyValues(previous, (row) => row.profile_views))
  const tapButtons = comparisonRows(
    sumBreakdownMaps(
      dailyValues(current, (row) => parseBreakdownMap(row.link_taps_by_button_type))
    ),
    sumBreakdownMaps(
      dailyValues(previous, (row) => parseBreakdownMap(row.link_taps_by_button_type))
    ),
    humanizeDimension
  )
  // The bio website link reports as the separate legacy website_clicks metric —
  // the contact_button_type breakdown covers only contact buttons, so an
  // account with a bio link would otherwise show an empty funnel while its
  // website taps sit uncounted in another column.
  const websiteNow = sumOrNull(dailyValues(current, (row) => row.website_clicks))
  const websiteThen = sumOrNull(dailyValues(previous, (row) => row.website_clicks))
  if (
    !tapButtons.some((row) => /website/i.test(row.key)) &&
    ((websiteNow ?? 0) > 0 || (websiteThen ?? 0) > 0)
  ) {
    tapButtons.push({
      key: 'website_clicks',
      label: 'Website link',
      now: websiteNow,
      then: websiteThen,
    })
    tapButtons.sort((a, b) => (b.now ?? 0) - (a.now ?? 0))
  }

  return {
    period,
    hasHistory: input.hasHistory,
    lastSyncAt: input.lastSyncAt,
    followersTotal,
    views,
    reach,
    interactions,
    followers: { gained, lost, net, total: followersTotal, series: followerCurve },
    engagementRate,
    reachByDay,
    bestDay,
    formats,
    interactionKinds,
    profileViews: {
      now: profileViewsNow,
      then: profileViewsThen,
      deltaPct: deltaPct(profileViewsNow, profileViewsThen),
    },
    tapButtons,
    audience: buildAudience(input.currentSnapshot, input.previousSnapshot),
    hasAudienceSnapshot: input.currentSnapshot !== null,
    posts,
    medianReach,
  }
}

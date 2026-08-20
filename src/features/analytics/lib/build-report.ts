import { z } from 'zod'
import type {
  IGAccountMetricColumns,
  IGPostMetricColumns,
  PublishedPostPinColumns,
} from '@/lib/queries/select-columns'
import { zonedTimeToInstant } from '@/utils/date-helpers'
import { RATE_BASE_FLOOR } from './delta-verdict'
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
  /** Follows Instagram itself attributes to this period's posts (per-media metric). */
  fromPosts: number | null
  /** Losses as a share of the followers the period started with. */
  churnPct: number | null
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

export interface AudienceOnline {
  /** Mean followers online per agency-local [weekday 0 = Monday][hour 0–23]. */
  grid: number[][]
  /** Days whose hourly map the API actually served — the evidence base. */
  sampleDays: number
  /** The three busiest cells, strongest first. */
  peaks: Array<{ weekday: number; hour: number; avg: number }>
}

export interface PublishWindowBucket {
  key: string
  label: string
  postCount: number
  medianReach: number | null
  /** Bucket median ÷ the period's overall median reach. */
  vsMedian: number | null
}

export interface FunnelStage {
  key: 'reached' | 'profile_views' | 'taps' | 'follows'
  label: string
  /** What one unit of this stage is — reach counts people, later stages count actions. */
  unit: string
  now: number | null
  then: number | null
  /** This period, per 100 of this stage's stated basis; null when unknowable. */
  per100: number | null
  /** The denominator the rate is honest against, e.g. "per 100 profile views". */
  rateBasis: string | null
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
  /**
   * Engaged share ÷ follower share — how far a band over- or under-engages
   * its own size. Null when the follower base is under 5% (ratio of slivers).
   */
  engagedIndex: number | null
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
  countries: AudienceShare[]
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
  /** The conversion path: reached → profile views → taps → new follows. */
  funnel: FunnelStage[]
  formats: ComparisonRow[]
  interactionKinds: ComparisonRow[]
  profileViews: ComparisonValue
  tapButtons: ComparisonRow[]
  audience: AudienceReport | null
  /** A snapshot exists for this window — audience null then means "under the floor". */
  hasAudienceSnapshot: boolean
  posts: ReportPostRow[]
  medianReach: number | null
  /** Null until ~a week of hourly maps exists — a thin sample must not speak. */
  audienceOnline: AudienceOnline | null
  publishWindows: PublishWindowBucket[]
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
    .map((band) => {
      const followerPct = followerAgePct(band) ?? 0
      const engagedPct = engagedAgePct ? engagedAgePct(band) : null
      return {
        band,
        followerPct,
        engagedPct,
        prevFollowerPct: prevAgePct ? prevAgePct(band) : null,
        engagedIndex: engagedPct !== null && followerPct >= 5 ? engagedPct / followerPct : null,
      }
    })

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

  // Countries arrive as ISO codes ("BG") — spell them out; unknown keys pass through.
  const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
  const countryPct = pctOf(follower.data.country)
  const prevCountryPct = prev?.success ? pctOf(prev.data.country) : null
  const countries: AudienceShare[] = Object.entries(follower.data.country)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([code]) => ({
      label: (/^[A-Z]{2}$/.test(code) ? regionNames.of(code) : null) ?? code,
      pct: countryPct(code) ?? 0,
      prevPct: prevCountryPct ? prevCountryPct(code) : null,
    }))

  return { snapshotDate: current.snapshot_date, ages, genders, cities, countries }
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

/** The hourly picture may only speak after this many sampled days. */
const MIN_ONLINE_DAYS = 5
const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
}

/**
 * Aggregates the per-day hourly follower-online maps into an agency-local
 * weekday × hour grid of means. Meta anchors both the day buckets and the
 * hour keys to America/Los_Angeles (probe 2026-08-20: the trough lands on the
 * audience's local night only under that reading), so each (day, hour) is
 * turned into a real instant there and re-read in the agency's clock.
 */
export function buildAudienceOnline(
  onlineByDay: Array<{ metric_date: string; online_followers_by_hour: unknown }>,
  timezone: string
): AudienceOnline | null {
  const sums = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  const counts = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  const zoned = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  })
  let sampleDays = 0
  for (const row of onlineByDay) {
    const map = parseBreakdownMap(row.online_followers_by_hour)
    if (!map || Object.keys(map).length === 0) continue
    sampleDays++
    for (const [hourKey, value] of Object.entries(map)) {
      const hour = Number(hourKey)
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue
      const instant = zonedTimeToInstant(
        row.metric_date,
        `${String(hour).padStart(2, '0')}:00`,
        'America/Los_Angeles'
      )
      const parts = zoned.formatToParts(instant)
      const weekday = WEEKDAY_INDEX[parts.find((part) => part.type === 'weekday')?.value ?? '']
      const localHour = Number(parts.find((part) => part.type === 'hour')?.value)
      if (weekday === undefined || !Number.isInteger(localHour) || localHour > 23) continue
      sums[weekday]![localHour]! += value
      counts[weekday]![localHour]! += 1
    }
  }
  if (sampleDays < MIN_ONLINE_DAYS) return null
  const grid = sums.map((row, weekday) =>
    row.map((sum, hour) => (counts[weekday]![hour]! > 0 ? sum / counts[weekday]![hour]! : 0))
  )
  const peaks = grid
    .flatMap((row, weekday) => row.map((avg, hour) => ({ weekday, hour, avg })))
    .filter((cell) => cell.avg > 0)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3)
  return { grid, sampleDays, peaks }
}

const DAYPARTS = [
  { key: 'morning', label: 'Morning · 06–11', match: (h: number) => h >= 6 && h < 11 },
  { key: 'midday', label: 'Midday · 11–17', match: (h: number) => h >= 11 && h < 17 },
  { key: 'evening', label: 'Evening · 17–22', match: (h: number) => h >= 17 && h < 22 },
  { key: 'night', label: 'Night · 22–06', match: (h: number) => h >= 22 || h < 6 },
] as const

/**
 * What each publish window earned: this period's synced posts bucketed by the
 * agency-local hour they went out, medians per bucket against the period's
 * overall median (medians, never means — one viral post must not crown its
 * hour forever). The view refuses to editorialize buckets under 3 posts.
 */
function buildPublishWindows(
  posts: ReportPostRow[],
  medianReach: number | null,
  timezone: string
): PublishWindowBucket[] {
  const hourFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hourCycle: 'h23',
  })
  const reachesByPart = new Map<string, number[]>()
  for (const post of posts) {
    if (post.missing !== null || !post.postedAt || post.reach === null) continue
    const hour = Number(hourFmt.format(new Date(post.postedAt)))
    if (!Number.isInteger(hour)) continue
    const part = DAYPARTS.find((candidate) => candidate.match(hour))
    if (!part) continue
    const list = reachesByPart.get(part.key) ?? []
    list.push(post.reach)
    reachesByPart.set(part.key, list)
  }
  return DAYPARTS.map((part) => {
    const reaches = reachesByPart.get(part.key) ?? []
    const bucketMedian = median(reaches)
    return {
      key: part.key,
      label: part.label,
      postCount: reaches.length,
      medianReach: bucketMedian,
      vsMedian:
        bucketMedian !== null && medianReach !== null && medianReach > 0
          ? bucketMedian / medianReach
          : null,
    }
  })
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
  /** Per-day hourly follower-online maps for the current window (may be empty). */
  onlineByDay: Array<{ metric_date: string; online_followers_by_hour: unknown }>
  /** The agency's clock — publish hours and online hours both render in it. */
  timezone: string
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
  const lostSeries = dailyValues(current, (row) => row.unfollows)
  const gained: ComparisonValue = {
    now: sumOrNull(gainedSeries),
    then: sumOrNull(dailyValues(previous, (row) => row.follows)),
    deltaPct: null,
  }
  gained.deltaPct = deltaPct(gained.now, gained.then)
  const lost: ComparisonValue = {
    now: sumOrNull(lostSeries),
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
  const followerCurve = deriveFollowerCurve(followerCounts, gainedSeries, lostSeries)

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

  const flowByDay: FollowerFlowDay[] = currentKeys.map((date, index) => ({
    date,
    gained: gainedSeries[index]!,
    lost: lostSeries[index]!,
    posts: postsByDate.get(date) ?? [],
  }))
  // Per-media follows, straight from Instagram's own attribution — a separate
  // basis from the account-level gained total, stated as its own fact.
  const followsFromPosts = sumOrNull(posts.map((post) => post.follows))
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

  // The one deliberate bridge between /media's vocabulary (FEED/REELS +
  // media_type) and the insights breakdown's (POST/REEL/CAROUSEL_CONTAINER).
  // Mapped key by key, never joined wholesale; STORY and AD have no media rows.
  const formatOfMedia = (post: ReportPostRow): string | null =>
    post.mediaType === 'CAROUSEL_ALBUM'
      ? 'CAROUSEL_CONTAINER'
      : post.mediaProductType === 'REELS'
        ? 'REEL'
        : post.mediaProductType === 'FEED'
          ? 'POST'
          : null
  const postCountByFormat = new Map<string, number>()
  for (const post of posts) {
    // Only media the sync verified — removed/pending rows carry no format truth.
    if (post.missing !== null) continue
    const key = formatOfMedia(post)
    if (key) postCountByFormat.set(key, (postCountByFormat.get(key) ?? 0) + 1)
  }

  const interactionsByTypeNow = sumBreakdownMaps(
    dailyValues(current, (row) => parseBreakdownMap(row.interactions_by_media_product_type))
  )
  const formats = comparisonRows(
    sumBreakdownMaps(
      dailyValues(current, (row) => parseBreakdownMap(row.reach_by_media_product_type))
    ),
    sumBreakdownMaps(
      dailyValues(previous, (row) => parseBreakdownMap(row.reach_by_media_product_type))
    ),
    (key) => FORMAT_LABELS[key] ?? humanizeDimension(key)
  ).map((row) => {
    const metaParts: string[] = []
    const count = postCountByFormat.get(row.key)
    if (count) metaParts.push(`${count} published`)
    // ER per format only when the denominator is solid — a rate off a few
    // hundred reached accounts is arithmetic, not evidence.
    const formatInteractions = interactionsByTypeNow?.[row.key]
    if (formatInteractions !== undefined && row.now !== null && row.now >= RATE_BASE_FLOOR) {
      metaParts.push(`${((formatInteractions / row.now) * 100).toFixed(1)}% ER`)
    }
    return metaParts.length > 0 ? { ...row, meta: metaParts.join(' · ') } : row
  })

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

  // The conversion path. Taps and follows are BOTH downstream of a profile
  // view, not of each other (most follows never touch a link), so both rates
  // read against profile views — never "follows per tap", which would exceed
  // 100 and mislead. Rates are ratios of events, not shares of people.
  const linkTapsNow = sumOrNull(dailyValues(current, (row) => row.profile_links_taps))
  const linkTapsThen = sumOrNull(dailyValues(previous, (row) => row.profile_links_taps))
  const tapsTotalNow = sumOrNull([linkTapsNow, websiteNow])
  const tapsTotalThen = sumOrNull([linkTapsThen, websiteThen])
  const per100 = (stage: number | null, basis: number | null): number | null =>
    stage !== null && basis !== null && basis > 0 ? (stage / basis) * 100 : null
  const funnel: FunnelStage[] = [
    {
      key: 'reached',
      label: 'Reached',
      unit: 'accounts',
      now: reach.now,
      then: reach.then,
      per100: null,
      rateBasis: null,
    },
    {
      key: 'profile_views',
      label: 'Profile views',
      unit: 'visits',
      now: profileViewsNow,
      then: profileViewsThen,
      per100: per100(profileViewsNow, reach.now),
      rateBasis: 'per 100 reached',
    },
    {
      key: 'taps',
      label: 'Link & contact taps',
      unit: 'taps',
      now: tapsTotalNow,
      then: tapsTotalThen,
      per100: per100(tapsTotalNow, profileViewsNow),
      rateBasis: 'per 100 profile views',
    },
    {
      key: 'follows',
      label: 'New follows',
      unit: 'follows',
      now: gained.now,
      then: gained.then,
      per100: per100(gained.now, profileViewsNow),
      rateBasis: 'per 100 profile views',
    },
  ]

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
    followers: {
      gained,
      lost,
      net,
      total: followersTotal,
      series: followerCurve,
      byDay: flowByDay,
      fromPosts: followsFromPosts,
      churnPct,
    },
    engagementRate,
    reachByDay,
    bestDay,
    funnel,
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
    audienceOnline: buildAudienceOnline(input.onlineByDay, input.timezone),
    publishWindows: buildPublishWindows(posts, medianReach, input.timezone),
  }
}

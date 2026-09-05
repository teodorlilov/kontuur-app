import { z } from 'zod'
import type { IGAudienceSnapshotColumns } from '@/lib/queries/select-columns'
import type {
  IGAccountMetricColumns,
  PlatformPostMetricColumns,
  PublishedPostPin,
} from '@/lib/queries/select-columns'
import { toDateKey, zonedTimeToInstant } from '@/utils/date-helpers'
import { parseTimestamp } from '@/utils/format'
import { WEEKDAY_LABELS_SHORT } from '@/utils/constants'
import { RATE_BASE_FLOOR } from './delta-verdict'
import { formatCount, formatSharePct } from './format'
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

/**
 * Derived, and the only declaration of this shape.
 *
 * `report-data.ts` held a structurally identical `SnapshotRow` and cast rows into it before handing
 * them here — one projection, written by hand twice, in two files, with both jsonb columns widened
 * to `unknown`. The narrowing that matters happens at `demographicsSchema` below, which is where it
 * always did.
 */
export type AudienceSnapshotInput = IGAudienceSnapshotColumns

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
  /** The compact one-liner — kept for print, which cannot be hovered. */
  meta?: string
  /** The same facts, each under its own name, for the hover card. */
  details?: Array<{ label: string; value: string }>
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
  /**
   * The previous-period day this column's `then` value actually came from.
   * The two windows share one axis, so without naming it the reader reads
   * "13 Aug · previous 3,948" and assumes both numbers describe 13 Aug.
   */
  thenDate: string
  /** That day's views — the tooltip pairs the two ways a day was seen. */
  views: number | null
  /** Posts published that day, strongest reach first. */
  posts: TrendPost[]
  /** Posts published on the previous-period day — what moved THAT line. */
  thenPosts: TrendPost[]
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

/**
 * Formats the /media endpoint never returns, so no per-post count can exist
 * for them however complete the sync is — their reach arrives only as an
 * account-level breakdown. The SECTION says this once, in its own words; a
 * per-row note repeated the apology on every affected row and told the reader
 * about our data source rather than about their account.
 */
export const UNITEMISED_FORMATS = new Set(['STORY', 'AD'])

/**
 * How much of a format's reach the rate-bearing days must cover before the
 * rate may stand for the period beside it.
 */
const PAIRED_COVERAGE_FLOOR = 0.5

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

/**
 * The agency-calendar day a timestamp falls on. The period's day keys are
 * resolved in the agency's clock, so reading the UTC prefix off an instant put
 * every post published in the first hours of local morning one column early —
 * and, on the window's opening day, pushed it out of the window altogether, so
 * a live post arrived through the ledger arm instead and was labelled "no
 * longer on Instagram".
 */
function dayKeyOf(iso: string | null, timezone: string): string | null {
  if (!iso) return null
  // parseTimestamp, not `new Date(iso)`: posts.published_at is a naive UTC
  // timestamp, which JS would otherwise read in the runtime's zone.
  const date = parseTimestamp(iso)
  return Number.isNaN(date.getTime()) ? null : toDateKey(date, timezone)
}

/** A sync this much newer than a publish had every chance to see the media. */
const SYNC_GRACE_MS = 60 * 60 * 1000

function buildPosts(
  postRows: PlatformPostMetricColumns[],
  publishedPosts: PublishedPostPin[],
  lastSyncAt: string | null,
  timezone: string
): {
  posts: ReportPostRow[]
  medianReach: number | null
} {
  const medianReach = median(
    postRows.map((row) => row.reach).filter((reach): reach is number => reach !== null)
  )
  const posts: ReportPostRow[] = postRows.map((row) => ({
    igMediaId: row.external_post_id,
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
    medianRatio:
      row.reach !== null && medianReach !== null && medianReach > 0
        ? row.reach / medianReach
        : null,
    missing: null as PostMissing,
  }))

  // Kontuur's own ledger fills what the sync cannot see: posts Instagram no
  // longer reports (deleted after publish) or has not synced yet. A post the
  // metrics table already covers defers to that richer row.
  const knownMedia = new Set(postRows.map((row) => row.external_post_id))
  const knownPostIds = new Set(postRows.map((row) => row.post_id))
  for (const publication of publishedPosts) {
    const post = publication.posts
    if (!publication.published_at) continue
    if (publication.external_post_id && knownMedia.has(publication.external_post_id)) continue
    if (knownPostIds.has(post.id)) continue
    const syncSawIt =
      lastSyncAt !== null &&
      parseTimestamp(lastSyncAt).getTime() - parseTimestamp(publication.published_at).getTime() >
        SYNC_GRACE_MS
    posts.push({
      igMediaId: publication.external_post_id ?? `post-${post.id}`,
      postId: post.id,
      caption: post.caption,
      postedAt: publication.published_at,
      postedDayKey: dayKeyOf(publication.published_at, timezone),
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
/**
 * `weekday: 'short'` output → the grid's Monday-first row index. Derived from
 * the shared list rather than restated: a private copy is free to disagree with
 * the labels when-to-post renders the same rows under.
 */
const WEEKDAY_INDEX: Record<string, number> = Object.fromEntries(
  WEEKDAY_LABELS_SHORT.map((label, index) => [label, index])
)

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
    // Anchored, not `new Date(iso)`: a naive timestamp would otherwise parse in
    // the runtime's zone rather than UTC, which is a different hour entirely.
    const hour = Number(hourFmt.format(parseTimestamp(post.postedAt)))
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
  postRows: PlatformPostMetricColumns[]
  /**
   * Kontuur's own published ledger for the same window — fills what the sync
   * cannot see. The read layer has already scoped these to the client's
   * CURRENTLY connected account (posts.ig_account_id stamp); rows published
   * to any other account never reach this builder.
   */
  publishedPosts: PublishedPostPin[]
  currentSnapshot: AudienceSnapshotInput | null
  previousSnapshot: AudienceSnapshotInput | null
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
  // strongest-reach first, so each day's list keeps that order. Only the
  // CURRENT window feeds the table and the medians; the previous window's
  // rows exist solely to explain the shape of the comparison line.
  const currentPostRows = input.postRows.filter((row) => {
    const date = dayKeyOf(row.posted_at, input.timezone)
    // A row without a timestamp has no day to belong to, so it can never be a
    // comparison-window pin — but the table still lists it, as it always has.
    return date === null || date >= period.start
  })
  const { posts, medianReach } = buildPosts(
    currentPostRows,
    input.publishedPosts,
    input.lastSyncAt,
    input.timezone
  )
  const postsByDate = new Map<string, TrendPost[]>()
  for (const post of posts) {
    const date = post.postedDayKey
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

  // The previous window's publications, from synced metrics only — the app
  // ledger's pins are scoped to the current window, so a previous-period post
  // Instagram never returned simply has no pin rather than a guessed one.
  const previousPostsByDate = new Map<string, TrendPost[]>()
  for (const row of input.postRows) {
    const date = dayKeyOf(row.posted_at, input.timezone)
    if (!date || date > period.prevEnd) continue
    const list = previousPostsByDate.get(date) ?? []
    list.push({
      igMediaId: row.external_post_id,
      caption: row.caption,
      mediaType: row.media_type,
      reach: row.reach,
      follows: row.follows,
      missing: null,
    })
    previousPostsByDate.set(date, list)
  }
  for (const list of previousPostsByDate.values()) {
    list.sort((a, b) => (b.reach ?? -1) - (a.reach ?? -1))
  }

  const reachByDay: ReachDay[] = currentKeys.map((date, index) => {
    const thenDate = previousKeys[index] ?? date
    return {
      date,
      now: reach.series[index]!,
      then: previous.byDay[index] ? previous.byDay[index].reach : null,
      thenDate,
      views: views.series[index]!,
      posts: postsByDate.get(date) ?? [],
      thenPosts: previousPostsByDate.get(thenDate) ?? [],
    }
  })

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
    const dayPost = posts.find((post) => post.postedDayKey === bestDate)
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
  /**
   * Our own rate for the formats Instagram itemises: every post's own
   * interactions over its own reach, summed per format. Doing the arithmetic
   * ourselves is what lets carousels have a rate at all — the account
   * breakdown omits CAROUSEL_CONTAINER entirely — and it repairs feed posts,
   * where that breakdown attributed 356 interactions to 279 reached accounts
   * (127%, from counting the two on different bases). Where both sources
   * exist they agree closely: reels read 6.7% here against Instagram's 7.8%,
   * a little lower because summing per-post reach counts a person once per
   * post that reached them, while the account figure counts them once.
   */
  const ownRateByFormat = new Map<string, { reach: number; interactions: number }>()
  for (const post of posts) {
    // Only media the sync verified — removed/pending rows carry no format truth.
    if (post.missing !== null) continue
    const key = formatOfMedia(post)
    if (!key) continue
    postCountByFormat.set(key, (postCountByFormat.get(key) ?? 0) + 1)
    if (post.reach === null || post.interactions === null) continue
    const tally = ownRateByFormat.get(key) ?? { reach: 0, interactions: 0 }
    tally.reach += post.reach
    tally.interactions += post.interactions
    ownRateByFormat.set(key, tally)
  }

  // A rate is only honest when both halves were measured on the SAME days.
  // Reach accumulates from every captured day while the interactions
  // breakdown can lag a few (a day backfilled before it was captured, a
  // failed sync phase); dividing across that gap once turned a real 0.45% ad
  // rate into "under 0.1%". So the rate is computed from the PAIRED days
  // alone, which keeps numerator and denominator on the same footing, and the
  // solidity floor now guards the denominator the rate actually used rather
  // than the window total beside it.
  const pairedDays = current.byDay.filter(
    (row): row is IGAccountMetricColumns =>
      row !== null &&
      parseBreakdownMap(row.interactions_by_media_product_type) !== null &&
      parseBreakdownMap(row.reach_by_media_product_type) !== null
  )
  const pairedReachByType = sumBreakdownMaps(
    pairedDays.map((row) => parseBreakdownMap(row.reach_by_media_product_type))
  )
  const interactionsByTypeNow = sumBreakdownMaps(
    pairedDays.map((row) => parseBreakdownMap(row.interactions_by_media_product_type))
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
    // Every fragment here answers one question the section header asks, and
    // names its own unit — "8 published · 0.4% engagement rate" reads without
    // a key. Abbreviations and apologies both failed that test.
    const metaParts: string[] = []
    const details: Array<{ label: string; value: string }> = []
    const count = postCountByFormat.get(row.key)
    if (count) {
      metaParts.push(`${count} published`)
      details.push({ label: 'Posts published', value: String(count) })
    }

    // A rate per format only when the denominator is solid — one off a few
    // hundred reached accounts is arithmetic, not evidence.
    let interactions: number | null = null
    let base: number | null = null
    const own = ownRateByFormat.get(row.key)
    if (own) {
      // We hold the posts, so we do the sum ourselves. A format we can itemise
      // NEVER falls back to the account breakdown, even when our own sample is
      // too thin to print: the breakdown's answer for those formats has
      // already proved untrustworthy.
      if (own.reach >= RATE_BASE_FLOOR) {
        interactions = own.interactions
        base = own.reach
      }
    } else {
      // Stories and ads have no media rows, so Instagram's own breakdown is
      // the only source — read from paired days, and only when those days
      // speak for the period on show. Half the window's reach is the line:
      // below it they are a corner of the period, not a sample of it.
      const fromBreakdown = interactionsByTypeNow?.[row.key]
      const breakdownBase = pairedReachByType?.[row.key] ?? null
      if (
        fromBreakdown !== undefined &&
        breakdownBase !== null &&
        breakdownBase >= RATE_BASE_FLOOR &&
        row.now !== null &&
        breakdownBase >= row.now * PAIRED_COVERAGE_FLOOR
      ) {
        interactions = fromBreakdown
        base = breakdownBase
      }
    }
    if (interactions !== null && base !== null) {
      const pct = (interactions / base) * 100
      // A real 0.05% rounded to "0.0%" reads as a measured zero, which it is
      // not — and as a broken number, which it looks like. Only an actual
      // zero may say none.
      const rate = interactions === 0 ? 'none' : pct < 0.1 ? 'under 0.1%' : `${pct.toFixed(1)}%`
      metaParts.push(interactions === 0 ? 'no interactions' : `${rate} engagement rate`)
      details.push({ label: 'Interactions', value: formatCount(interactions) })
      details.push({ label: 'Engagement rate', value: rate })
    }
    return metaParts.length > 0 ? { ...row, meta: metaParts.join(' · '), details } : row
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
    return `${formatSharePct((part / interactions.now) * 100)} of interactions`
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
      ...(meta ? { meta, details: [{ label: 'Share of interactions', value: meta }] } : {}),
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
      // Instagram's own wording throughout these labels, so a manager can
      // hold this panel beside the app's Insights screen and match them up.
      label: 'Accounts reached',
      unit: 'accounts',
      now: reach.now,
      then: reach.then,
      per100: null,
      rateBasis: null,
    },
    {
      key: 'profile_views',
      label: 'Profile visits',
      unit: 'visits',
      now: profileViewsNow,
      then: profileViewsThen,
      per100: per100(profileViewsNow, reach.now),
      rateBasis: 'per 100 accounts reached',
    },
    {
      key: 'taps',
      label: 'Link & contact taps',
      unit: 'taps',
      now: tapsTotalNow,
      then: tapsTotalThen,
      per100: per100(tapsTotalNow, profileViewsNow),
      rateBasis: 'per 100 profile visits',
    },
    {
      key: 'follows',
      label: 'New follows',
      unit: 'follows',
      now: gained.now,
      then: gained.then,
      per100: per100(gained.now, profileViewsNow),
      rateBasis: 'per 100 profile visits',
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
    // The full fetched span (prevStart..end), not just the current window:
    // "when are followers online" is a habit, not a comparison, so every
    // sampled day strengthens it — and the panel prints the honest count.
    audienceOnline: buildAudienceOnline(input.accountRows, input.timezone),
    publishWindows: buildPublishWindows(posts, medianReach, input.timezone),
  }
}

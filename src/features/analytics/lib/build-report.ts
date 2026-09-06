import { z } from 'zod'
import type { IGAudienceSnapshotColumns } from '@/lib/queries/select-columns'
import type {
  IGAccountMetricColumns,
  PlatformPostMetricColumns,
  PublishedPostPin,
} from '@/lib/queries/select-columns'
import { getZonedParts, mondayFirstIndex, zonedTimeToInstant } from '@/utils/date-helpers'
import { parseTimestamp } from '@/utils/format'
import { RATE_BASE_FLOOR } from './delta-verdict'
import { formatCount, formatSharePct } from './format'
import { periodDayKeys, type AnalyticsPeriod } from './period'
import {
  alignRows,
  buildDailyTrend,
  buildFollowerSummary,
  buildPosts,
  dailyValues,
  dayKeyOf,
  deltaPct,
  groupTrendPostsByDay,
  median,
  previousTrendPostsByDay,
  stripCell,
  sumOrNull,
  type ComparisonValue,
  type FollowerSummary,
  type ReachDay,
  type ReportPostRow,
  type StripCell,
} from './report-sections'

// Re-exported for the consumers that always imported them from here — the section math moved
// to report-sections.ts when Facebook's builder arrived, so both builders compose one
// implementation; nothing downstream had to move with it.
export { deltaPct, sumOrNull } from './report-sections'
export type {
  FollowerFlowDay,
  FollowerSummary,
  ReachDay,
  ReportPostRow,
  TrendPost,
} from './report-sections'

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

/** The hourly picture may only speak after this many sampled days. */
const MIN_ONLINE_DAYS = 5

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
      // One formatter pass for both halves, and a cached formatter rather than a private one.
      const { weekday: weekdayName, hour: localHour } = getZonedParts(instant, timezone)
      const weekday = mondayFirstIndex(weekdayName)
      if (weekday < 0 || !Number.isInteger(localHour) || localHour > 23) continue
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
  // No pre-filter: `alignRows` selects by EXACT day key, so a row outside the window is never
  // picked up and filtering first only walks the array twice more for the same answer.
  const current = alignRows(input.accountRows, currentKeys)
  const previous = alignRows(input.accountRows, previousKeys)

  const views = stripCell(current, previous, (row) => row.views)
  const reach = stripCell(current, previous, (row) => row.reach)
  const interactions = stripCell(current, previous, (row) => row.total_interactions)

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
  const postsByDate = groupTrendPostsByDay(posts)
  const previousPostsByDate = previousTrendPostsByDay(
    input.postRows,
    period.prevEnd,
    input.timezone
  )

  const reachByDay: ReachDay[] = buildDailyTrend({
    currentKeys,
    previousKeys,
    nowSeries: reach.series,
    thenSeries: dailyValues(previous, (row) => row.reach),
    secondarySeries: views.series,
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
    // Per-media follows, straight from Instagram's own attribution — a separate
    // basis from the account-level gained total, stated as its own fact.
    fromPosts: sumOrNull(posts.map((post) => post.follows)),
  })

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
      now: followers.gained.now,
      then: followers.gained.then,
      per100: per100(followers.gained.now, profileViewsNow),
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
    followers,
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

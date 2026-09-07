import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPageDaySeries, fetchPagePostMeasurements } from '@/lib/meta/facebook/insights'
import { fetchPostIdsByMediaId } from '@/lib/queries/posts-by-media-id'
import type { SyncableConnection } from '@/lib/queries/select-columns'
import { PLATFORM_NAMES } from '@/lib/validation'
import { MS_PER_DAY, SECONDS_PER_DAY } from '@/utils/constants'
import { dayKeyToUnixSeconds, shiftDateKey } from '@/utils/date-helpers'
import { upsertFbPageMetricDays, type FbPageMetricsInsert } from './fb-page-metrics-store'
import { dayChunks } from '../compute/period'
import { fbMarkers, readMarkerRows } from '../shared/unfilled-days'
import { upsertPostMetricRows, type PlatformPostMetricsInsert } from '../shared/post-metrics-store'
import {
  runSyncPhases,
  syncRoster,
  type MetricsSyncOutcome,
  type SyncPhase,
} from '../shared/sync-shared'

/**
 * The nightly Facebook Page capture — the thin sibling of `syncAllClientMetrics`, written
 * against the probe (docs/META-FB-PROBE.md, 2026-09-06), which is why it is thin: Meta's
 * 2025-11-15 purge left Pages five day-series metrics and the posts' own field tallies.
 * No reach, no demographics, no follower-online hours — nothing here fakes them.
 *
 * The loop shape is COPIED from the Instagram sync on purpose, the same blessing the comments
 * sync records: sequential across clients, a wall-clock budget checked between clients, and a
 * hard stop on the first rate limit, because Meta's quota is per-app and one 429 poisons every
 * remaining call in the run. What must not drift — the outcome vocabulary, phase isolation,
 * sync health, notification copy — is imported from `sync-shared.ts`, not copied.
 *
 * The whole run costs at most six Graph calls per client: five ranged day series (a 30-day
 * backfill costs the same five, since the range rides the request) and one published_posts
 * read carrying identity and measurements together.
 */

/** Meta keeps consolidating a finished day's numbers; re-capturing this window converges. */
const FB_CONSOLIDATION_DAYS = 7

/** First sync of a Page: Meta serves history on request, so a month arrives in the same calls. */
const FB_BACKFILL_DAYS = 30

/** How far back a post's tallies keep being refreshed. Matches Instagram's media lookback. */
const POST_LOOKBACK_DAYS = 30

/** Nightly Page metrics for every client with a live Facebook connection. */
export async function syncAllFacebookMetrics(
  admin: SupabaseClient,
  { timeBudgetMs }: { timeBudgetMs: number }
): Promise<MetricsSyncOutcome> {
  return syncRoster(admin, {
    platform: 'facebook',
    networkLabel: PLATFORM_NAMES.facebook,
    timeBudgetMs,
    syncOne: (connection) => syncClientPageMetrics(admin, connection),
  })
}

/** One client's Page capture: the day series, then the posts — each phase isolated. */
async function syncClientPageMetrics(
  admin: SupabaseClient,
  connection: SyncableConnection & { client_id: string }
): Promise<void> {
  const { client_id: clientId, account_id: pageId, access_token: accessToken } = connection

  const hadHistory = await hasPageHistory(admin, clientId, pageId)

  const phases: SyncPhase[] = [
    {
      name: 'page days',
      /**
       * A fresh Page gets the 30-day backfill in the SAME five calls a nightly capture
       * costs — the range rides the request — so a just-connected client has a follower
       * curve tomorrow morning, not in a month. An established Page re-captures the short
       * trailing window, which is all Meta's consolidation lag needs.
       */
      run: async () => {
        const days = hadHistory ? FB_CONSOLIDATION_DAYS : FB_BACKFILL_DAYS
        const untilTs = Math.floor(Date.now() / 1000)
        const sinceTs = untilTs - days * SECONDS_PER_DAY
        const series = await fetchPageDaySeries(pageId, accessToken, sinceTs, untilTs)
        await upsertFbPageMetricDays(
          admin,
          zipPageDays(clientId, pageId, series),
          'facebook page days'
        )
      },
    },
    {
      name: 'post measurements',
      run: async () => {
        const sinceIso = new Date(Date.now() - POST_LOOKBACK_DAYS * MS_PER_DAY).toISOString()
        const posts = await fetchPagePostMeasurements(pageId, accessToken, sinceIso)
        if (posts.length === 0) return
        const postIdByExternal = await fetchPostIdsByMediaId(
          admin,
          clientId,
          posts.map((post) => post.id)
        )
        await upsertPostMetricRows(
          admin,
          posts.map((post) => toPostMetricRow(clientId, pageId, post, postIdByExternal)),
          'facebook post measurements'
        )
      },
    },
  ]

  const failures = await runSyncPhases(phases)
  if (failures.length > 0) {
    throw new Error(
      `partial sync (${failures.length} of ${phases.length} phases) — ${failures.join(' | ')}`
    )
  }
}

/** The most days one insights call may span — 120 answered `Invalid parameter`, 90 served 90 points (probed 2026-09-06). */
const FILL_CHUNK_DAYS = 90

/**
 * Fill a WINDOW of Page days on demand — Facebook's whole answer to Instagram's
 * auto-fill machinery, and the reason it is one function instead of an apparatus:
 * Instagram serves most metrics as one aggregate per asked window, so filling means
 * walking day by day at ~5 calls each; Facebook serves native day series, so a 90-day
 * chunk costs the same five calls a single night does. History reaches at least two
 * years back (probed).
 *
 * Days Meta serves land as measured rows. Days it does NOT serve get a MARKER row —
 * identity and `totals_synced_at` only, every measure absent — recording "asked, nothing
 * there" so the unfilled count stops counting them and the auto-fill chain terminates.
 * The same both-null-row pattern the audience snapshot writes, for the same reason.
 *
 * `wroteDays` counts days that were NOT already stored. It used to count every row upserted,
 * which on a re-run is the whole window — so `wroteDays === 0` was unreachable and the caller's
 * "stalled" signal, the thing that stops the auto-fill chain re-firing, could never be true. A
 * chunk whose every day is already marked is skipped entirely rather than re-asked.
 */
export async function fillPageWindow(
  admin: SupabaseClient,
  {
    clientId,
    pageId,
    accessToken,
    fromDate,
    toDate,
  }: { clientId: string; pageId: string; accessToken: string; fromDate: string; toDate: string }
): Promise<{ wroteDays: number }> {
  const now = new Date().toISOString()
  let wroteDays = 0

  const marked = new Set(
    (
      await readMarkerRows(
        admin,
        fbMarkers(clientId, pageId),
        // readMarkerRows spans prevStart→end; this window is already the span to cover.
        {
          preset: 'custom',
          start: fromDate,
          end: toDate,
          prevStart: fromDate,
          prevEnd: toDate,
          days: 0,
        }
      )
    )
      .filter((row) => row.totals_synced_at !== null)
      .map((row) => row.metric_date)
  )

  for (const chunk of dayChunks(fromDate, toDate, FILL_CHUNK_DAYS)) {
    // Every day already asked of Meta: nothing here to fetch.
    const chunkDays: string[] = []
    for (let day = chunk.start; day <= chunk.end; day = shiftDateKey(day, 1)) chunkDays.push(day)
    if (chunkDays.every((day) => marked.has(day))) continue

    const sinceTs = dayKeyToUnixSeconds(chunk.start)
    // `until` is exclusive-ish at Meta's end; one day past the chunk's last day covers it.
    const untilTs = dayKeyToUnixSeconds(shiftDateKey(chunk.end, 1))
    const series = await fetchPageDaySeries(pageId, accessToken, sinceTs, untilTs)
    const rows = zipPageDays(clientId, pageId, series)

    const served = new Set(rows.map((row) => row.metric_date))
    for (const day of chunkDays) {
      if (served.has(day)) continue
      rows.push({ client_id: clientId, page_id: pageId, metric_date: day, totals_synced_at: now })
    }
    // Only rows inside the asked window count — the series can bleed a bucket past it.
    const inWindow = rows.filter(
      (row) => row.metric_date >= chunk.start && row.metric_date <= chunk.end
    )
    await upsertFbPageMetricDays(admin, inWindow, 'facebook window fill')
    wroteDays += inWindow.filter((row) => !marked.has(row.metric_date)).length
  }

  // The window's posts, identity and tallies together — the same single read the nightly
  // capture uses, just anchored at the window's start.
  const posts = await fetchPagePostMeasurements(pageId, accessToken, `${fromDate}T00:00:00Z`)
  if (posts.length > 0) {
    const postIdByExternal = await fetchPostIdsByMediaId(
      admin,
      clientId,
      posts.map((post) => post.id)
    )
    await upsertPostMetricRows(
      admin,
      posts.map((post) => toPostMetricRow(clientId, pageId, post, postIdByExternal)),
      'facebook window fill posts'
    )
  }

  return { wroteDays }
}

/** Any day ever captured for this Page — decides backfill vs trailing window. */
async function hasPageHistory(
  admin: SupabaseClient,
  clientId: string,
  pageId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from('fb_page_metrics')
    .select('id')
    .eq('client_id', clientId)
    .eq('page_id', pageId)
    .limit(1)
  if (error) throw new Error(`fb_page_metrics lookup failed: ${error.message}`)
  return (data ?? []).length > 0
}

/**
 * Five per-metric series zipped into day rows. A date appears when ANY metric served it, and
 * a metric absent for that date stays absent from the row — the upsert only touches the keys
 * it is given, so absence never overwrites a value a fuller capture stored.
 *
 * Exported for its test: this mapping is exactly what `npm run check` cannot see.
 */
export function zipPageDays(
  clientId: string,
  pageId: string,
  series: Awaited<ReturnType<typeof fetchPageDaySeries>>
): FbPageMetricsInsert[] {
  const now = new Date().toISOString()
  const byDate = new Map<string, FbPageMetricsInsert>()
  const rowFor = (date: string): FbPageMetricsInsert => {
    const existing = byDate.get(date)
    if (existing) return existing
    const created: FbPageMetricsInsert = {
      client_id: clientId,
      page_id: pageId,
      metric_date: date,
      totals_synced_at: now,
    }
    byDate.set(date, created)
    return created
  }
  // page_follows is the follower LEVEL at each day's close — the page_fans insight is dead
  // and the probe recorded the level riding this series (docs/META-FB-PROBE.md).
  for (const point of series.page_follows) rowFor(point.date).followers_count = point.value
  for (const point of series.page_daily_follows_unique) rowFor(point.date).follows = point.value
  for (const point of series.page_daily_unfollows_unique) rowFor(point.date).unfollows = point.value
  for (const point of series.page_post_engagements)
    rowFor(point.date).post_engagements = point.value
  for (const point of series.page_views_total) rowFor(point.date).page_views = point.value
  return [...byDate.values()]
}

/** One Page post's identity and tallies in the neutral table's vocabulary. Exported for its test. */
export function toPostMetricRow(
  clientId: string,
  pageId: string,
  post: Awaited<ReturnType<typeof fetchPagePostMeasurements>>[number],
  postIdByExternal: Map<string, string>
): PlatformPostMetricsInsert {
  // WHY reactions, not likes alone: Facebook's tally spans every reaction type and serves no
  // like-only count on this call. Reactions are what a person means by "likes" here, and the
  // column is the nearest honest fit.
  const reactions = post.reactions?.summary?.total_count ?? null
  const comments = post.comments?.summary?.total_count ?? null
  // Absent means zero for THIS field, probed: the live post's envelope carried no `shares`
  // key while genuinely having none. Unlike the insights envelopes, absence here is an answer.
  const shares = post.shares?.count ?? 0
  return {
    client_id: clientId,
    platform: 'facebook',
    platform_account_id: pageId,
    external_post_id: post.id,
    post_id: postIdByExternal.get(post.id) ?? null,
    caption: post.message ?? null,
    permalink: post.permalink_url ?? null,
    thumbnail_url: post.full_picture ?? null,
    // Facebook's post list offers no media_type vocabulary; a guess would sit in a column
    // the report reads (the same reasoning as the comments adapter's identity write).
    media_type: null,
    media_product_type: null,
    posted_at: post.created_time ?? null,
    like_count: reactions,
    comments_count: comments,
    shares,
    // Computed, because Meta serves no per-post total for Pages: the three tallies this call
    // carries, summed. Null only when nothing at all was served.
    total_interactions:
      reactions === null && comments === null ? null : (reactions ?? 0) + (comments ?? 0) + shares,
    // Dead at Meta's end for Pages (2025-11-15 purge) — stored as the truth, never zero:
    // reach, views, saved, follows, profile_visits stay absent.
    last_synced_at: new Date().toISOString(),
  }
}

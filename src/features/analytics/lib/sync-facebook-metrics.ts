import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { GraphApiError } from '@/lib/meta/graph-errors'
import { fetchPageDaySeries, fetchPagePostMeasurements } from '@/lib/meta/facebook/insights'
import { fetchPostIdsByMediaId } from '@/lib/queries/posts-by-media-id'
import {
  SOCIAL_CONNECTION_SYNC_COLUMNS,
  type SyncableConnection,
} from '@/lib/queries/select-columns'
import { PLATFORM_NAMES } from '@/lib/validation'
import { MS_PER_DAY } from '@/utils/constants'
import { upsertFbPageMetricDays, type FbPageMetricsInsert } from './fb-page-metrics-store'
import { upsertPostMetricRows, type PlatformPostMetricsInsert } from './post-metrics-store'
import {
  notifyMetricsBlocked,
  notifySyncIncomplete,
  recordSyncHealth,
  runSyncPhases,
  type MetricsSyncOutcome,
  type SyncPhase,
} from './sync-shared'

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
  const startedAt = Date.now()
  const outcome: MetricsSyncOutcome = { synced: 0, skipped: 0, failed: 0, errors: [] }

  const { data, error } = await admin
    .from('social_connections')
    .select(SOCIAL_CONNECTION_SYNC_COLUMNS)
    .eq('platform', 'facebook')
    .not('access_token', 'is', null)
    .not('account_id', 'is', null)
  if (error) throw new Error(`facebook connection roster query failed: ${error.message}`)
  // WHY as: the shared SupabaseClient param is untyped, so the projection does not infer.
  const connections = (data ?? []) as SyncableConnection[]

  for (const [index, connection] of connections.entries()) {
    // Between clients, not inside one: a client either syncs whole or not at all.
    if (Date.now() - startedAt > timeBudgetMs) {
      outcome.skipped += connections.length - index
      break
    }
    const { client_id: clientId } = connection
    if (!clientId) {
      outcome.failed++
      outcome.errors.push({ clientId: connection.account_id, error: 'connection has no client_id' })
      continue
    }
    try {
      await syncClientPageMetrics(admin, { ...connection, client_id: clientId })
      outcome.synced++
      await recordSyncHealth(admin, clientId, 'facebook', null)
    } catch (err) {
      outcome.failed++
      const message = err instanceof Error ? err.message : 'unknown error'
      outcome.errors.push({ clientId, error: message })
      await recordSyncHealth(admin, clientId, 'facebook', message)
      if (err instanceof GraphApiError) {
        if (err.failure === 'token_invalid' || err.failure === 'permission') {
          try {
            await notifyMetricsBlocked(admin, clientId, PLATFORM_NAMES.facebook)
          } catch (notifyErr) {
            outcome.errors.push({
              clientId,
              error: `notify failed: ${notifyErr instanceof Error ? notifyErr.message : 'unknown'}`,
            })
          }
          continue
        }
        // One rate-limit answer poisons every remaining call in this run.
        // Self-healing by tomorrow, so it earns a stored verdict but no alert.
        if (err.failure === 'rate_limited') {
          outcome.skipped += connections.length - index - 1
          break
        }
      }
      try {
        await notifySyncIncomplete(admin, clientId)
      } catch (notifyErr) {
        outcome.errors.push({
          clientId,
          error: `notify failed: ${notifyErr instanceof Error ? notifyErr.message : 'unknown'}`,
        })
      }
    }
  }
  return outcome
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
        const sinceTs = untilTs - Math.floor((days * MS_PER_DAY) / 1000)
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

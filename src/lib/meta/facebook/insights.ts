import 'server-only'

import { graphGet } from '../graph-client'
import { FB_GRAPH_BASE } from '../constants'
import {
  fbInsightsEnvelopeSchema,
  fbPostMeasurementsSchema,
  type FBPostMeasurements,
} from '../schemas'
import { dailySeriesOf } from '../insight-values'

/**
 * Facebook Page insights fetch layer — the sibling of Instagram's insights module, written
 * against the probe (docs/META-FB-PROBE.md, 2026-09-06 section), not Meta's docs.
 *
 * What the probe established, and this file leans on:
 *
 * - The app's OWN stored Page token reads insights — no `read_insights` scope needed.
 * - Meta's 2025-11-15 purge killed reach/impressions, demographics and follower-online hours
 *   outright (code 100, "not a valid insights metric"). Nothing here asks for them, and no
 *   caller may fake them.
 * - A `period=day` request with since/until returns the WHOLE window as one series per
 *   metric — so a 30-day backfill costs the same five calls as a nightly capture.
 * - `page_follows` is the follower LEVEL as a day series; the `page_fans` insight is dead.
 *
 * Speaks Graph only. Every write belongs to the sync's store.
 */

/**
 * The five Page metrics that survived the purge and this product renders.
 *
 * One metric per call, deliberately — the probe's rule: a single dead name fails a batched
 * request, which is exactly how the previous integration concluded ALL Page metrics were gone
 * and shipped zeros for months. `page_video_views` is alive but omitted: this product
 * publishes photos, and a forever-zero series is noise.
 */
export const PAGE_DAY_METRICS = [
  'page_follows',
  'page_daily_follows_unique',
  'page_daily_unfollows_unique',
  'page_post_engagements',
  'page_views_total',
] as const

type PageDayMetric = (typeof PAGE_DAY_METRICS)[number]

/** One day-bucketed point per served day, per metric. Absent days mean Meta served nothing. */
type PageDaySeries = Record<PageDayMetric, Array<{ date: string; value: number }>>

/**
 * The five day series over [sinceTs, untilTs) — five calls, run together.
 *
 * Date bucketing follows the same `end_time.split('T')` convention Instagram's reach series
 * uses (`dailySeriesOf`), so the two networks' days line up under one rule.
 */
export async function fetchPageDaySeries(
  pageId: string,
  accessToken: string,
  sinceTs: number,
  untilTs: number
): Promise<PageDaySeries> {
  const envelopes = await Promise.all(
    PAGE_DAY_METRICS.map((metric) =>
      graphGet(fbInsightsEnvelopeSchema, `${FB_GRAPH_BASE}/${pageId}/insights`, accessToken, {
        metric,
        period: 'day',
        since: String(sinceTs),
        until: String(untilTs),
      })
    )
  )
  // WHY as: Object.fromEntries widens keys to string; PAGE_DAY_METRICS is their single source.
  return Object.fromEntries(
    PAGE_DAY_METRICS.map((metric, index) => [metric, dailySeriesOf(envelopes[index]!.data, metric)])
  ) as PageDaySeries
}

/** Matches the comment sweep's page size — one 50-post page covers a 30-day lookback with room. */
const POST_PAGE_LIMIT = 50

const POST_MEASUREMENT_FIELDS =
  'id,created_time,message,permalink_url,full_picture,shares,' +
  'reactions.summary(true).limit(0),comments.summary(true).limit(0)'

/**
 * Identity AND measurements for the Page's published posts since the given instant, in ONE
 * call — the fields route the probe verified (`reactions.summary`/`comments.summary` tallies,
 * `shares` absent when zero). Per-post reach does not exist; nothing here pretends otherwise.
 */
export async function fetchPagePostMeasurements(
  pageId: string,
  accessToken: string,
  sinceIso: string
): Promise<FBPostMeasurements[]> {
  const page = await graphGet(
    fbPostMeasurementsSchema,
    `${FB_GRAPH_BASE}/${pageId}/published_posts`,
    accessToken,
    {
      fields: POST_MEASUREMENT_FIELDS,
      since: String(Math.floor(new Date(sinceIso).getTime() / 1000)),
      limit: String(POST_PAGE_LIMIT),
    }
  )
  return page.data
}

import 'server-only'

import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { generateAnalyticsSummary } from '@/ai/analytics/generate-summary'
import type { AnalyticsReportData } from './build-report'
import type { AnalyticsPeriod } from './period'
import { getAnalyticsReport, IG_METRICS_TAG } from './report-data'

/**
 * The narrative block: four-to-five sentences written from this period's
 * numbers. Live views (the range presets, or a hand-picked window) regenerate
 * after each nightly sync — the sync stamp is part of the cache key — and can
 * be re-rolled on demand via the regenerate action, which busts this cache.
 * Only a window opened through an archive link shows the stored wording: an
 * exported report keeps its words until it is deliberately rewritten.
 */

const CAPTION_FACT_CHARS = 120

export interface NarrativeResult {
  text: string
  /** True when the words came from an exported report, not a fresh generation. */
  archived: boolean
}

/**
 * The bounded aggregate the model sees. The old report path stringified the
 * entire metrics object — every post, every caption — into the prompt; this is
 * the same story in a few hundred tokens.
 */
export function buildNarrativeFacts(data: AnalyticsReportData): Record<string, unknown> {
  return {
    period: { start: data.period.start, end: data.period.end, days: data.period.days },
    comparedTo: { start: data.period.prevStart, end: data.period.prevEnd },
    reach: { now: data.reach.now, previous: data.reach.then },
    views: { now: data.views.now, previous: data.views.then },
    interactions: { now: data.interactions.now, previous: data.interactions.then },
    engagementRatePct: { now: data.engagementRate.now, previous: data.engagementRate.then },
    followers: {
      total: data.followers.total,
      gained: data.followers.gained.now,
      lost: data.followers.lost.now,
      net: data.followers.net.now,
      netPrevious: data.followers.net.then,
    },
    reachByFormat: data.formats.map((row) => ({
      format: row.label,
      now: row.now,
      previous: row.then,
    })),
    interactionKinds: data.interactionKinds.map((row) => ({
      kind: row.label,
      now: row.now,
      previous: row.then,
    })),
    profileTaps: data.tapButtons.map((row) => ({
      button: row.label,
      now: row.now,
      previous: row.then,
    })),
    audience: data.audience
      ? {
          topAgeBands: [...data.audience.ages]
            .sort((a, b) => b.followerPct - a.followerPct)
            .slice(0, 2)
            .map((band) => ({ band: band.band, followerPct: Math.round(band.followerPct) })),
          topCity: data.audience.cities[0]?.label ?? null,
        }
      : null,
    postsPublished: data.posts.length,
    medianReach: data.medianReach,
    topPosts: data.posts.slice(0, 3).map((post) => ({
      caption: post.caption?.slice(0, CAPTION_FACT_CHARS) ?? null,
      format: post.mediaProductType,
      reach: post.reach,
      interactions: post.interactions,
      follows: post.follows,
    })),
  }
}

/** Deterministic one-liner for when the model is unavailable — numbers, no prose. */
export function buildFallbackNarrative(data: AnalyticsReportData): string | null {
  if (data.reach.now === null && data.views.now === null) return null
  const parts: string[] = []
  if (data.reach.now !== null) {
    const delta =
      data.reach.deltaPct === null
        ? ''
        : ` (${data.reach.deltaPct >= 0 ? 'up' : 'down'} ${Math.abs(data.reach.deltaPct).toFixed(0)}% on the period before)`
    parts.push(`Reach was ${data.reach.now.toLocaleString('en-US')}${delta}`)
  }
  if (data.views.now !== null) parts.push(`views ${data.views.now.toLocaleString('en-US')}`)
  if (data.followers.net.now !== null) {
    const net = data.followers.net.now
    parts.push(`${net >= 0 ? '+' : ''}${net.toLocaleString('en-US')} followers net`)
  }
  return `${parts.join(' · ')}.`
}

/** Writes a fresh summary from the current table data — no cache, no archive lookup. */
async function composeFreshNarrative(
  clientId: string,
  clientName: string,
  period: AnalyticsPeriod,
  timezone: string
): Promise<string | null> {
  const report = await getAnalyticsReport(clientId, period, timezone)
  if (!report.hasHistory || (report.reach.now === null && report.views.now === null)) {
    return null
  }
  const summary = await generateAnalyticsSummary({
    clientName,
    platform: 'Instagram',
    startDate: period.start,
    endDate: period.end,
    metricsJson: buildNarrativeFacts(report),
  })
  return summary || null
}

const _fetchNarrative = unstable_cache(
  async (
    clientId: string,
    clientName: string,
    preset: AnalyticsPeriod['preset'],
    start: string,
    end: string,
    prevStart: string,
    prevEnd: string,
    days: number,
    timezone: string,
    // Part of the cache key on purpose: a new nightly sync writes a new stamp,
    // which is what "regenerates after each sync" means mechanically.
    syncStamp: string
  ): Promise<NarrativeResult | null> => {
    void syncStamp
    const period: AnalyticsPeriod = { preset, start, end, prevStart, prevEnd, days }

    // Only an archive-linked window (from/to in the URL) reuses stored wording.
    // Preset views are live and must never be pinned by an earlier export —
    // that pin is exactly the "can't generate a new report" trap.
    if (preset === 'custom') {
      const admin = createAdminSupabaseClient()
      // Account-scoped like every analytics read: a report exported for a
      // previously connected account must never resurface its wording here.
      const { data: connRow } = await admin
        .from('social_connections')
        .select('account_id')
        .eq('client_id', clientId)
        .ilike('platform', 'instagram')
        .limit(1)
        .maybeSingle()
      const accountId = (connRow as { account_id: string | null } | null)?.account_id ?? null
      if (accountId) {
        const { data: archived, error } = await admin
          .from('analytics_reports')
          .select('ai_summary')
          .eq('client_id', clientId)
          .eq('ig_account_id', accountId)
          .eq('period_start', start)
          .eq('period_end', end)
          .maybeSingle()
        // Missing stamp column (migration 20260826 not applied yet) skips the
        // archive lookup rather than losing the narrative entirely.
        if (error && !error.message.includes('ig_account_id')) {
          throw new Error(`archived summary lookup failed: ${error.message}`)
        }
        // WHY as: the shared admin client is untyped, so the projection does not infer.
        const archivedSummary = (archived as { ai_summary: string } | null)?.ai_summary
        if (archivedSummary) return { text: archivedSummary, archived: true }
      }
    }

    const text = await composeFreshNarrative(clientId, clientName, period, timezone)
    return text === null ? null : { text, archived: false }
  },
  // v2: the pull-quote prompt — a new key prefix orphans the long v1 texts so
  // every client regenerates in the short voice on first view after deploy.
  ['analytics-narrative-v2'],
  { revalidate: 86_400, tags: [IG_METRICS_TAG] }
)

/**
 * The narrative for one client and period, cached until the next nightly sync
 * or an explicit regenerate. Failure is contained here — a narrative is worth
 * having, never worth a 500.
 */
export async function getNarrative(
  clientId: string,
  clientName: string,
  period: AnalyticsPeriod,
  timezone: string,
  lastSyncAt: string | null
): Promise<NarrativeResult | null> {
  try {
    return await _fetchNarrative(
      clientId,
      clientName,
      period.preset,
      period.start,
      period.end,
      period.prevStart,
      period.prevEnd,
      period.days,
      timezone,
      lastSyncAt?.slice(0, 10) ?? 'never'
    )
  } catch (err) {
    console.error('[analytics] narrative generation failed', { clientId, err })
    return null
  }
}

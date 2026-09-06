import 'server-only'

import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchConnectionSyncState } from '@/lib/queries/db'
import { generateAnalyticsSummary } from '@/ai/analytics/generate-summary'
import { PLATFORM_NAMES } from '@/lib/validation'
import type { FacebookReportData } from './build-facebook-report'
import { FB_METRICS_TAG, getFacebookAnalyticsReport } from './facebook-report-data'
import { formatCount } from './format'
import { fetchArchivedSummary, type NarrativeResult } from './narrative-shared'
import type { AnalyticsPeriod } from './period'

/**
 * The Facebook document's narrative — the sibling of `narrative.ts`, holding to its rules:
 * live windows regenerate after each nightly sync (the sync stamp keys the cache), only an
 * archive-linked window reuses stored wording, and failure is contained because a narrative
 * is worth having, never worth a 500.
 *
 * Its own module rather than a mode on Instagram's, because what a network can honestly
 * narrate differs: the facts below carry NO reach, NO audience, NO formats — Meta deleted
 * those for Pages (docs/META-FB-PROBE.md), and a fact sheet with empty slots invites the
 * model to write about absence.
 */

const CAPTION_FACT_CHARS = 120

/** The bounded aggregate the model sees — only what Facebook actually serves. */
export function buildFacebookNarrativeFacts(data: FacebookReportData): Record<string, unknown> {
  return {
    period: { start: data.period.start, end: data.period.end, days: data.period.days },
    comparedTo: { start: data.period.prevStart, end: data.period.prevEnd },
    postEngagements: { now: data.engagements.now, previous: data.engagements.then },
    pageViews: { now: data.pageViews.now, previous: data.pageViews.then },
    followers: {
      total: data.followers.total,
      gained: data.followers.gained.now,
      lost: data.followers.lost.now,
      net: data.followers.net.now,
      netPrevious: data.followers.net.then,
    },
    postsPublished: data.posts.length,
    medianInteractions: data.medianInteractions,
    topPosts: data.posts.slice(0, 3).map((post) => ({
      caption: post.caption?.slice(0, CAPTION_FACT_CHARS) ?? null,
      reactions: post.likeCount,
      comments: post.commentsCount,
      shares: post.shares,
      interactions: post.interactions,
    })),
  }
}

/**
 * Deterministic one-liner for when the model is unavailable — numbers, no prose,
 * mirroring the Instagram fallback's tone.
 */
export function buildFacebookFallbackNarrative(data: FacebookReportData): string | null {
  if (data.engagements.now === null && data.pageViews.now === null) return null
  const parts: string[] = []
  if (data.engagements.now !== null) {
    const delta =
      data.engagements.deltaPct === null
        ? ''
        : ` (${data.engagements.deltaPct >= 0 ? 'up' : 'down'} ${Math.abs(data.engagements.deltaPct).toFixed(0)}% on the period before)`
    parts.push(`Post engagements were ${formatCount(data.engagements.now)}${delta}`)
  }
  if (data.pageViews.now !== null) parts.push(`Page views ${formatCount(data.pageViews.now)}`)
  if (data.followers.net.now !== null) {
    const net = data.followers.net.now
    parts.push(`${net >= 0 ? '+' : ''}${formatCount(net)} followers net`)
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
  const report = await getFacebookAnalyticsReport(clientId, period, timezone)
  if (!report.hasHistory || (report.engagements.now === null && report.pageViews.now === null)) {
    return null
  }
  const summary = await generateAnalyticsSummary({
    clientName,
    platform: PLATFORM_NAMES.facebook,
    startDate: period.start,
    endDate: period.end,
    metricsJson: buildFacebookNarrativeFacts(report),
  })
  return summary || null
}

const _fetchFacebookNarrative = unstable_cache(
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
    // Part of the cache key on purpose: a new nightly sync writes a new stamp.
    syncStamp: string
  ): Promise<NarrativeResult | null> => {
    void syncStamp
    const period: AnalyticsPeriod = { preset, start, end, prevStart, prevEnd, days }

    // Only an archive-linked window (from/to in the URL) reuses stored wording — the same
    // live-views-stay-live rule the Instagram narrative holds to.
    if (preset === 'custom') {
      const admin = createAdminSupabaseClient()
      const { accountId } = await fetchConnectionSyncState(admin, clientId, 'facebook')
      if (accountId) {
        const archivedSummary = await fetchArchivedSummary(admin, {
          clientId,
          accountId,
          platform: 'facebook',
          start,
          end,
        })
        if (archivedSummary) return { text: archivedSummary, archived: true }
      }
    }

    const text = await composeFreshNarrative(clientId, clientName, period, timezone)
    return text === null ? null : { text, archived: false }
  },
  ['facebook-narrative-v1'],
  { revalidate: 86_400, tags: [FB_METRICS_TAG] }
)

/** The Facebook narrative for one client and period, cached until the next nightly sync. */
export async function getFacebookNarrative(
  clientId: string,
  clientName: string,
  period: AnalyticsPeriod,
  timezone: string,
  lastSyncAt: string | null
): Promise<NarrativeResult | null> {
  try {
    return await _fetchFacebookNarrative(
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
    console.error('[analytics] facebook narrative generation failed', { clientId, err })
    return null
  }
}

import 'server-only'

import { unstable_cache } from 'next/cache'
import { PLATFORM_NAMES } from '@/lib/validation'
import type { FacebookReportData } from './build-facebook-report'
import { FB_METRICS_TAG, getFacebookAnalyticsReport } from './facebook-report-data'
import {
  buildFallbackSentence,
  factCaption,
  guardNarrative,
  narrativeSpine,
  resolveNarrative,
  type NarrativeArgs,
  type NarrativeResult,
  type NarrativeSpec,
} from '../shared/narrative-shared'
import type { AnalyticsPeriod } from '../compute/period'

/**
 * The Facebook document's narrative — the sibling of `narrative.ts`, composing the same
 * sequence from `narrative-shared.ts`: live windows regenerate after each nightly sync (the
 * sync stamp keys the cache), only an archive-linked window reuses stored wording.
 *
 * Its own fact sheet rather than a mode on Instagram's, because what a network can honestly
 * narrate differs: the facts below carry NO reach, NO audience, NO formats — Meta deleted
 * those for Pages (docs/META-FB-PROBE.md), and a fact sheet with empty slots invites the
 * model to write about absence.
 */

/** The bounded aggregate the model sees — only what Facebook actually serves. */
export function buildFacebookNarrativeFacts(data: FacebookReportData): Record<string, unknown> {
  return {
    ...narrativeSpine(data.period, data.followers, data.posts.length),
    postEngagements: { now: data.engagements.now, previous: data.engagements.then },
    pageViews: { now: data.pageViews.now, previous: data.pageViews.then },
    medianInteractions: data.medianInteractions,
    topPosts: data.posts.slice(0, 3).map((post) => ({
      caption: factCaption(post.caption),
      reactions: post.likeCount,
      comments: post.commentsCount,
      shares: post.shares,
      interactions: post.interactions,
    })),
  }
}

/**
 * Deterministic one-liner for when the model is unavailable — numbers, no prose,
 * mirroring the Instagram fallback's tone because it IS the Instagram fallback,
 * led by the two metrics Facebook has.
 */
export function buildFacebookFallbackNarrative(data: FacebookReportData): string | null {
  return buildFallbackSentence({
    headline: {
      lead: 'Post engagements were',
      value: data.engagements.now,
      deltaPct: data.engagements.deltaPct,
    },
    second: { lead: 'Page views', value: data.pageViews.now },
    netFollowers: data.followers.net.now,
  })
}

const FB_NARRATIVE: NarrativeSpec<FacebookReportData> = {
  platform: 'facebook',
  platformName: PLATFORM_NAMES.facebook,
  getReport(clientId, period, timezone) {
    return getFacebookAnalyticsReport(clientId, period, timezone)
  },
  isSilent(report) {
    return report.engagements.now === null && report.pageViews.now === null
  },
  facts(report) {
    return buildFacebookNarrativeFacts(report)
  },
}

const _fetchFacebookNarrative = unstable_cache(
  async (
    args: NarrativeArgs,
    // Part of the cache key on purpose: a new nightly sync writes a new stamp.
    syncStamp: string
  ): Promise<NarrativeResult | null> => {
    void syncStamp
    return resolveNarrative(FB_NARRATIVE, args)
  },
  // The network is named explicitly — see the Instagram site for why the key literal, not the
  // callback text, is what keeps the two networks' cached narratives apart.
  ['facebook-narrative-v1', 'facebook'],
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
  return guardNarrative(clientId, PLATFORM_NAMES.facebook, () =>
    _fetchFacebookNarrative(
      { clientId, clientName, period, timezone },
      lastSyncAt?.slice(0, 10) ?? 'never'
    )
  )
}

import 'server-only'

import { unstable_cache } from 'next/cache'
import { PLATFORM_NAMES } from '@/lib/validation'
import type { AnalyticsReportData } from './build-report'
import {
  buildFallbackSentence,
  factCaption,
  guardNarrative,
  narrativeSpine,
  resolveNarrative,
  type NarrativeArgs,
  type NarrativeResult,
  type NarrativeSpec,
} from './narrative-shared'
import type { AnalyticsPeriod } from './period'
import { getAnalyticsReport, IG_METRICS_TAG } from './report-data'

/**
 * The narrative block: four-to-five sentences written from this period's
 * numbers. Live views (the range presets, or a hand-picked window) regenerate
 * after each nightly sync — the sync stamp is part of the cache key — and can
 * be re-rolled on demand via the regenerate action, which busts this cache.
 * Only a window opened through an archive link shows the stored wording: an
 * exported report keeps its words until it is deliberately rewritten.
 *
 * The sequence itself lives in `narrative-shared.ts`; what stays here is what
 * Instagram in particular can say — the fact sheet and the two metrics that
 * decide whether there is anything to say at all.
 */

/**
 * The bounded aggregate the model sees. The old report path stringified the
 * entire metrics object — every post, every caption — into the prompt; this is
 * the same story in a few hundred tokens.
 */
function buildNarrativeFacts(data: AnalyticsReportData): Record<string, unknown> {
  return {
    ...narrativeSpine(data.period, data.followers, data.posts.length),
    reach: { now: data.reach.now, previous: data.reach.then },
    views: { now: data.views.now, previous: data.views.then },
    interactions: { now: data.interactions.now, previous: data.interactions.then },
    engagementRatePct: { now: data.engagementRate.now, previous: data.engagementRate.then },
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
    medianReach: data.medianReach,
    topPosts: data.posts.slice(0, 3).map((post) => ({
      caption: factCaption(post.caption),
      format: post.mediaProductType,
      reach: post.reach,
      interactions: post.interactions,
      follows: post.follows,
    })),
  }
}

/** Deterministic one-liner for when the model is unavailable — numbers, no prose. */
export function buildFallbackNarrative(data: AnalyticsReportData): string | null {
  return buildFallbackSentence({
    headline: { lead: 'Reach was', value: data.reach.now, deltaPct: data.reach.deltaPct },
    second: { lead: 'views', value: data.views.now },
    netFollowers: data.followers.net.now,
  })
}

const IG_NARRATIVE: NarrativeSpec<AnalyticsReportData> = {
  platform: 'instagram',
  platformName: PLATFORM_NAMES.instagram,
  // Method shorthand throughout — see the NarrativeSpec doc comment for why a property
  // reference to an imported binding would be a silent-failure hazard here.
  getReport(clientId, period, timezone) {
    return getAnalyticsReport(clientId, period, timezone)
  },
  isSilent(report) {
    return report.reach.now === null && report.views.now === null
  },
  facts(report) {
    return buildNarrativeFacts(report)
  },
}

const _fetchNarrative = unstable_cache(
  async (
    args: NarrativeArgs,
    // Part of the cache key on purpose: a new nightly sync writes a new stamp,
    // which is what "regenerates after each sync" means mechanically.
    syncStamp: string
  ): Promise<NarrativeResult | null> => {
    void syncStamp
    return resolveNarrative(IG_NARRATIVE, args)
  },
  // v2: the pull-quote prompt — a new key prefix orphans the long v1 texts so
  // every client regenerates in the short voice on first view after deploy.
  // The network is named explicitly: this callback and Facebook's are now the same
  // two lines, so the key literal is the only thing keeping the two caches apart.
  ['analytics-narrative-v2', 'instagram'],
  { revalidate: 86_400, tags: [IG_METRICS_TAG] }
)

/**
 * The narrative for one client and period, cached until the next nightly sync
 * or an explicit regenerate.
 */
export async function getNarrative(
  clientId: string,
  clientName: string,
  period: AnalyticsPeriod,
  timezone: string,
  lastSyncAt: string | null
): Promise<NarrativeResult | null> {
  return guardNarrative(clientId, PLATFORM_NAMES.instagram, () =>
    _fetchNarrative({ clientId, clientName, period, timezone }, lastSyncAt?.slice(0, 10) ?? 'never')
  )
}

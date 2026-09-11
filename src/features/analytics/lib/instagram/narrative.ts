import 'server-only'

import { unstable_cache } from 'next/cache'
import { PLATFORM_NAMES } from '@/lib/meta/platforms'
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
} from '../shared/narrative-shared'
import type { AnalyticsPeriod } from '../compute/period'
import { getAnalyticsReport, IG_METRICS_TAG } from './report-data'

/**
 * The narrative block: this period's numbers written as a short pull-quote.
 * Live views (the range presets, or a hand-picked window) regenerate after
 * each nightly sync — the sync stamp is part of the cache key, and the
 * IG_METRICS_TAG below drops the entry whenever a fill or a sync writes.
 * Only a window opened through an archive link shows the stored wording: an
 * exported report keeps its words until it is deliberately rewritten.
 *
 * The sequence itself lives in `narrative-shared.ts`; what stays here is what
 * Instagram in particular can say — the fact sheet and the two metrics that
 * decide whether there is anything to say at all.
 */

/**
 * The bounded aggregate the model sees: period totals, the two strongest age
 * bands and the three strongest posts — never the whole report object, whose
 * every post and full caption would go into the prompt verbatim.
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

/**
 * Instagram's half of the narrative contract. Every function here is declared with METHOD
 * SHORTHAND: `NarrativeSpec`'s doc comment records why a property pointing at an imported binding
 * would be a silent-failure hazard.
 */
const IG_NARRATIVE: NarrativeSpec<AnalyticsReportData> = {
  platform: 'instagram',
  platformName: PLATFORM_NAMES.instagram,
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

/**
 * The cached generation, keyed on three things that all have to be in the key.
 *
 * `syncStamp` is a parameter for that reason alone — a new nightly sync writes a new stamp, which
 * is what "regenerates after each sync" means mechanically. The prefix is versioned because a
 * cached narrative outlives the prompt that wrote it: a new key orphans the old texts instead of
 * serving them (v2 = the pull-quote prompt). And the network is named explicitly, which is where
 * `narrative-shared.ts` explains why the two call sites stay in their own modules.
 */
const _fetchNarrative = unstable_cache(
  async (args: NarrativeArgs, syncStamp: string): Promise<NarrativeResult | null> => {
    void syncStamp
    return resolveNarrative(IG_NARRATIVE, args)
  },
  ['analytics-narrative-v2', 'instagram'],
  { revalidate: 86_400, tags: [IG_METRICS_TAG] }
)

/** The narrative for one client and period, cached until the next nightly sync. */
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

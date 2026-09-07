import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchConnectionSyncState } from '@/lib/queries/db'
import { generateAnalyticsSummary } from '@/ai/analytics/generate-summary'
import { formatCount } from '../compute/format'
import type { AnalyticsPeriod } from '../compute/period'
import type { FollowerSummary } from '../compute/report-sections'

/**
 * What the two networks' narrative modules share: the archive-then-generate sequence, the part of
 * a fact sheet that reads the same either way, the fallback one-liner and the failure guard. What
 * stays per network is what that network can honestly say about itself — its own fact sheet, and
 * its own cache identity.
 *
 * The two `unstable_cache` call sites deliberately stay in their own modules. Next builds the
 * cache key as `cb.toString()` joined with `keyParts` (next/dist/server/web/spec-extension/
 * unstable-cache.js), so one shared call site would be one cache for both networks — and the two
 * callbacks are now the same two lines, which is why each `keyParts` names its network
 * explicitly rather than trusting those texts to differ.
 */

const CAPTION_FACT_CHARS = 120

export interface NarrativeResult {
  text: string
  /** True when the words came from an exported report, not a fresh generation. */
  archived: boolean
}

/**
 * The stored wording of an exported report for exactly this window, or null.
 *
 * Account- AND platform-scoped: both networks archive into `analytics_reports`, so without the
 * platform filter a lookup could hand one network's words to the other's document, and without
 * the account filter a report exported for a previously connected account resurfaces after a
 * reconnect.
 */
async function fetchArchivedSummary(
  admin: SupabaseClient,
  scope: { clientId: string; accountId: string; platform: string; start: string; end: string }
): Promise<string | null> {
  const { data, error } = await admin
    .from('analytics_reports')
    .select('ai_summary')
    .eq('client_id', scope.clientId)
    .eq('platform_account_id', scope.accountId)
    .eq('platform', scope.platform)
    .eq('period_start', scope.start)
    .eq('period_end', scope.end)
    .maybeSingle()
  if (error) throw new Error(`archived summary lookup failed: ${error.message}`)
  // WHY as: the shared SupabaseClient param is untyped, so the projection does not infer.
  return (data as { ai_summary: string } | null)?.ai_summary ?? null
}

/** A caption at fact-sheet length. One constant, so the two sheets cannot drift apart on it. */
export function factCaption(caption: string | null | undefined): string | null {
  return caption?.slice(0, CAPTION_FACT_CHARS) ?? null
}

/**
 * The part of a fact sheet that is the same story on any network: which window, what it is being
 * compared against, the follower ledger, and how many posts went out.
 *
 * Deliberately NOT the whole sheet. Each network's headline metrics and per-post shape stay in
 * its own builder, and `facebook-narrative.test.ts` asserts Facebook's exact key set — the pin
 * that keeps a well-meaning "harmonisation" from teaching the model about metrics Meta does not
 * serve for Pages.
 */
export function narrativeSpine(
  period: AnalyticsPeriod,
  followers: FollowerSummary,
  postsPublished: number
): Record<string, unknown> {
  return {
    period: { start: period.start, end: period.end, days: period.days },
    comparedTo: { start: period.prevStart, end: period.prevEnd },
    followers: {
      total: followers.total,
      gained: followers.gained.now,
      lost: followers.lost.now,
      net: followers.net.now,
      netPrevious: followers.net.then,
    },
    postsPublished,
  }
}

/**
 * The deterministic one-liner shown when the model is unavailable — numbers, no prose.
 *
 * `lead` carries its own verb ("Reach was", "Post engagements were") because the two networks'
 * headline metrics disagree on number: the sentence is the shared thing, the noun is not.
 */
export function buildFallbackSentence(input: {
  headline: { lead: string; value: number | null; deltaPct: number | null }
  second: { lead: string; value: number | null }
  netFollowers: number | null
}): string | null {
  const { headline, second, netFollowers } = input
  if (headline.value === null && second.value === null) return null
  const parts: string[] = []
  if (headline.value !== null) {
    const delta =
      headline.deltaPct === null
        ? ''
        : ` (${headline.deltaPct >= 0 ? 'up' : 'down'} ${Math.abs(headline.deltaPct).toFixed(0)}% on the period before)`
    parts.push(`${headline.lead} ${formatCount(headline.value)}${delta}`)
  }
  if (second.value !== null) parts.push(`${second.lead} ${formatCount(second.value)}`)
  if (netFollowers !== null) {
    parts.push(`${netFollowers >= 0 ? '+' : ''}${formatCount(netFollowers)} followers net`)
  }
  return `${parts.join(' · ')}.`
}

/**
 * Everything a network must supply to have a narrative written for it.
 *
 * Declare every function here with METHOD SHORTHAND, never as a property pointing at an imported
 * binding. A property reference resolves once, when the spec object is evaluated at module load;
 * an import cycle reaching that module would leave it `undefined`, and `guardNarrative` below
 * turns the resulting TypeError into a permanent silent fallback that no test covers.
 */
export interface NarrativeSpec<Report extends { hasHistory: boolean }> {
  /** As `analytics_reports.platform` stores it, and as the connection lookup filters on. */
  readonly platform: 'instagram' | 'facebook'
  /** As the prompt should name the network. */
  readonly platformName: string
  getReport(clientId: string, period: AnalyticsPeriod, timezone: string): Promise<Report>
  /** True when both headline metrics are absent — nothing to narrate, so nothing is written. */
  isSilent(report: Report): boolean
  facts(report: Report): Record<string, unknown>
}

export interface NarrativeArgs {
  clientId: string
  clientName: string
  period: AnalyticsPeriod
  timezone: string
}

/**
 * Archive first, then generate — the sequence both networks follow.
 *
 * Only an archive-linked window reuses stored wording: `preset === 'custom'` is exactly the case
 * where from/to came off the URL (`resolvePeriod`). Preset views are live, and pinning one to an
 * earlier export would leave a client unable to see a newer report for the same range.
 */
export async function resolveNarrative<Report extends { hasHistory: boolean }>(
  spec: NarrativeSpec<Report>,
  { clientId, clientName, period, timezone }: NarrativeArgs
): Promise<NarrativeResult | null> {
  if (period.preset === 'custom') {
    const admin = createAdminSupabaseClient()
    const { accountId } = await fetchConnectionSyncState(admin, clientId, spec.platform)
    if (accountId) {
      const archivedSummary = await fetchArchivedSummary(admin, {
        clientId,
        accountId,
        platform: spec.platform,
        start: period.start,
        end: period.end,
      })
      if (archivedSummary) return { text: archivedSummary, archived: true }
    }
  }

  const report = await spec.getReport(clientId, period, timezone)
  if (!report.hasHistory || spec.isSilent(report)) return null

  const summary = await generateAnalyticsSummary({
    clientName,
    platform: spec.platformName,
    startDate: period.start,
    endDate: period.end,
    metricsJson: spec.facts(report),
  })
  return summary ? { text: summary, archived: false } : null
}

/** A narrative is worth having, never worth a 500. */
export async function guardNarrative(
  clientId: string,
  platformName: string,
  run: () => Promise<NarrativeResult | null>
): Promise<NarrativeResult | null> {
  try {
    return await run()
  } catch (err) {
    console.error('[analytics] narrative generation failed', { clientId, platformName, err })
    return null
  }
}

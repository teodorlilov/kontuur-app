import 'server-only'

import { allocateByWeight, type WeightedPillar } from '@/lib/clients/content-pillars'
import { rankSourceItems, RANK_MIN_ITEMS } from './rank-source-items'
import { ResearchPromptBuilder } from './prompts/prompt-builder'
import { generateTopics } from './generators/topic-generator'
import { computeFetchLimits, BRIEF_FETCH_LIMITS, BRIEF_WEB_RESULTS } from './fetch-limits'
import {
  gatherSources,
  attachSourceFullText,
  attachSourceAttribution,
  type ResearchSourceKind,
} from './source-gathering'
import type { ResearchRunContext, ResearchTopic, SkippedPillar } from './types'

/**
 * What a briefs-only run gathers. RSS is a recency stream selected for the client's
 * niche — a poor match for one specific request, and the costliest fetch of the
 * three. The client's own website and files are where "post about our new
 * programme" actually lives, and nothing else can reach them.
 */
const BRIEF_SOURCE_KINDS: readonly ResearchSourceKind[] = ['website', 'file']

/**
 * Stages B and C of generation: rank the gathered material, then decide what each
 * post is about.
 *
 * Stage A lives in `source-gathering.ts` because it is shared with runs built from
 * user-supplied briefs, which need the same material but none of the topic ideation
 * below. Everything here is ideation: allocating topics across pillars, filtering
 * what the model invented, and reporting pillars research could not cover.
 */
export async function performResearch(ctx: ResearchRunContext): Promise<ResearchTopic[]> {
  const researchCount = ctx.count
  const briefs = ctx.briefs ?? []

  // Nothing to plan. Gathering here would crawl sources, run a search and ask the
  // model for "up to 0 topics" — which is what a briefs-only run used to do.
  if (researchCount === 0 && briefs.length === 0) return []

  // A run with no topics of its own to choose gathers differently: an explicit
  // budget instead of one scaled to a post count that is zero, and only the
  // client's own material plus a web search. A mixed run still needs the full
  // batch treatment for its researched half.
  const isBriefsOnly = researchCount === 0
  const gathered = await gatherSources(ctx, {
    limits: isBriefsOnly ? BRIEF_FETCH_LIMITS : computeFetchLimits(researchCount),
    webResultCount: isBriefsOnly ? BRIEF_WEB_RESULTS : researchCount + 2,
    sourceKinds: isBriefsOnly ? BRIEF_SOURCE_KINDS : undefined,
    // Every brief gets a query written about its subject. A mixed run searches for
    // both: the niche queries feed the researched half, these feed the briefs.
    focusTexts: briefs.length > 0 ? briefs.map((b) => b.text) : undefined,
    includePerformance: !isBriefsOnly,
  })

  // An empty gather ends a researched batch — there is nothing to ground topics in.
  // It does not end a run built from briefs: the client supplied the topic, so the
  // post is written from the brief alone and the writer has a no-source branch.
  if (!gathered.hasAnySources && briefs.length === 0) {
    ctx.onPhase?.('No source material found', 'gathering')
    return []
  }

  const { clientData, context, effectivePillars, preSkippedPillars } = gathered

  // Performance items bypass the ranker: <=5 curated, audience-proven entries.
  // Only announce ranking when it will actually run (rankSourceItems skips
  // below RANK_MIN_ITEMS) so the phase message never flashes on a no-op.
  const rankableCount = context.rssItems.length + (context.webSearchItems?.length ?? 0)
  if (rankableCount >= RANK_MIN_ITEMS) {
    ctx.onPhase?.('Ranking source material...', 'planning')
  }
  const effectiveContext = await rankSourceItems(context, {
    niche: ctx.niche,
    targetAudience: clientData.targetAudience,
    contentPillars: effectivePillars,
    sourceStats: clientData.sourceStats,
    focusTexts: briefs.length > 0 ? briefs.map((b) => b.text) : undefined,
  })

  ctx.onPhase?.('Generating theme ideas...', 'planning')
  const builder = new ResearchPromptBuilder({
    niche: ctx.niche,
    languageConfig: clientData.languageConfig,
    contentPillars: effectivePillars,
    postHistory: clientData.history,
    excludedUrls: clientData.usedUrls,
    recentPillarCounts: clientData.recentPillarCounts,
  })

  const topics = await generateTopics(builder, { briefs, researchCount }, effectiveContext)

  // A brief's topic is kept whether or not the model found it a source: the client
  // supplied the subject, and an unsourced post written from the brief is a real
  // post. A researched topic without a source is the model inventing, so it goes —
  // there is no retry round, because the prompt already requires grounding and
  // asking twice cost a second Sonnet call to enforce a rule it had already stated.
  const { briefTopics, researchTopics } = partitionByBrief(topics, briefs.length)
  const groundedResearchTopics = researchTopics.filter(isGrounded)
  const finalTopics = [...briefTopics, ...groundedResearchTopics.slice(0, researchCount)]

  reportSkippedPillars(ctx, {
    effectivePillars,
    preSkippedPillars,
    allPillars: clientData.contentPillars,
    recentPillarCounts: clientData.recentPillarCounts,
    // Post-filter coverage: a pillar whose only topic was invented (and dropped by
    // the grounding filter) delivered nothing, so it must be reported skipped.
    coveredTopics: groundedResearchTopics,
    researchCount,
  })

  attachSourceFullText(finalTopics, gathered.fullTextIndex)
  attachSourceAttribution(finalTopics, gathered.attributionIndex)

  for (const topic of finalTopics) ctx.onTopic?.(topic)
  return finalTopics
}

/**
 * Split the model's response into the topics it planned for briefs and the ones it
 * chose itself, keeping brief order and one topic per brief.
 */
function partitionByBrief(
  topics: ResearchTopic[],
  briefCount: number
): { briefTopics: ResearchTopic[]; researchTopics: ResearchTopic[] } {
  const byIndex = new Map<number, ResearchTopic>()
  const researchTopics: ResearchTopic[] = []

  for (const topic of topics) {
    const index = topic.brief_index
    // Out-of-range indices are the model mislabelling; treat them as its own topics
    // rather than dropping work, and never let one brief claim another's slot.
    // A blank theme cannot claim a slot either: it would become the post's
    // description, and the route writes a real title from the brief instead.
    if (
      typeof index === 'number' &&
      index >= 1 &&
      index <= briefCount &&
      !byIndex.has(index) &&
      !!topic.suggested_theme?.trim()
    ) {
      byIndex.set(index, topic)
    } else {
      // A demoted topic is a researched topic now. Clearing the index matters:
      // downstream keys themes by brief_index, and a stale one would let this
      // topic shadow the brief's real theme.
      researchTopics.push(topic.brief_index == null ? topic : { ...topic, brief_index: null })
    }
  }

  const briefTopics = [...byIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, topic]) => topic)

  return { briefTopics, researchTopics }
}

/** A topic the model actually sourced, rather than one it invented. */
function isGrounded(t: ResearchTopic): boolean {
  return (
    !!t.suggested_theme?.trim() &&
    (!!t.source_url || t.source_type === 'file' || t.source_type === 'performance')
  )
}

/**
 * Report pillars research could not cover. Only a pillar the prompt asked topics of
 * can be "skipped by research" — at small run sizes the allocation instructs the LLM
 * to generate 0 for most pillars, and those are rotation, not failures.
 */
function reportSkippedPillars(
  ctx: ResearchRunContext,
  input: {
    effectivePillars: WeightedPillar[]
    preSkippedPillars: SkippedPillar[]
    allPillars: WeightedPillar[]
    recentPillarCounts: Map<string, number>
    coveredTopics: ResearchTopic[]
    researchCount: number
  }
): void {
  // Same allocateByWeight call as buildPillarAllocationBlock, so the ask here
  // matches what the prompt actually said.
  const asked = allocateByWeight(
    input.effectivePillars,
    input.researchCount,
    input.recentPillarCounts
  )
  const covered = new Set(input.coveredTopics.map((t) => t.pillar).filter(Boolean))
  const postLlmSkipped: SkippedPillar[] = input.effectivePillars
    .filter((p) => (asked.get(p.pillar) ?? 0) > 0 && !covered.has(p.pillar))
    .map((p) => ({ name: p.pillar }))
  const skippedPillars = [...input.preSkippedPillars, ...postLlmSkipped]

  if (skippedPillars.length === 0) return

  // A second allocation, over ALL pillars rather than the effective ones, because a
  // pre-skipped pillar is absent from `asked` and would otherwise count as costing
  // nothing. Same deficit weighting as the first call so the two cannot disagree
  // about what a pillar was owed.
  const allocation = allocateByWeight(
    input.allPillars,
    input.researchCount,
    input.recentPillarCounts
  )
  const skippedCount = skippedPillars.reduce((sum, p) => sum + (allocation.get(p.name) ?? 0), 0)
  ctx.onSkippedPillars?.(skippedPillars, skippedCount)
}

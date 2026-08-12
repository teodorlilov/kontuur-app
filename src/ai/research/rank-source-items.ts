import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { extractToolInput } from '@/utils/ai'
import { sanitizePromptField } from '@/ai/utils/sanitize'
import type { WeightedPillar } from '@/lib/clients/content-pillars'
import type { SourceContext } from './types'
import type { SourceUsageStats } from '@/lib/queries/db'
import type { RssItem } from '@/lib/sources/fetch-rss'
import type { TrendSearchResult } from '@/lib/sources/fetch-trend-search'

const RANK_SCORE_THRESHOLD = 4
/** Historical approval/discard boost is clamped to ± this many score points. */
const RANK_BOOST_CLAMP = 2
export const RANK_PER_PILLAR_CAP = 4
export const RANKED_RSS_CAP = 12
export const RANKED_WEB_CAP = 8
/** Below this many rankable items the call costs more than it saves. */
export const RANK_MIN_ITEMS = 8

const SNIPPET_MAX_CHARS = 200

export interface RankOptions {
  niche: string
  targetAudience?: string
  contentPillars: WeightedPillar[]
  /** Per-source outcome history — sources that fueled approved posts get a bounded score boost. */
  sourceStats?: SourceUsageStats[]
  /**
   * User-supplied subjects (briefs, client ideas) this run must serve. Without
   * them the ranker judges "relevance to this business" alone and can filter out
   * every result a brief's focus query found — an off-niche brief would lose all
   * its material before topic planning ever saw it.
   */
  focusTexts?: readonly string[]
}

interface Ranking {
  index: number
  score: number
  bestPillar: string | null
}

const RANK_OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    rankings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          score: { type: 'integer', minimum: 0, maximum: 10 },
          bestPillar: { type: ['string', 'null'] },
        },
        required: ['index', 'score', 'bestPillar'],
      },
    },
  },
  required: ['rankings'],
}

const RANK_SYSTEM_PROMPT = `You score content items for a social media research pipeline.
For each numbered item, judge ONE question: could a strong, specific social media post for THIS business be built from this item?
- 8-10: directly usable — concrete, current, and squarely in the business's territory
- 5-7: usable with work — relevant but generic or tangential
- 0-4: noise — off-topic, too generic, or irrelevant to this audience
bestPillar: the single content pillar this item serves best, or null if none fits.
Score every item. Be strict — the pipeline only keeps the strongest items.`

function buildRankUserPrompt(
  lines: string[],
  opts: RankOptions
): string {
  const pillarsText = opts.contentPillars.map((p) => `- ${p.pillar}`).join('\n')

  const focusBlock =
    opts.focusTexts && opts.focusTexts.length > 0
      ? `\nThe client has explicitly requested posts about these subjects:\n${opts.focusTexts
          .map((t) => `- ${sanitizePromptField(t)}`)
          .join(
            '\n'
          )}\nScore an item that serves one of these requests by its relevance to the request, not to the business's usual territory.\n`
      : ''

  return `Business: ${opts.niche}
Audience: ${opts.targetAudience ?? 'general'}
Content pillars:
${pillarsText}
${focusBlock}
Items:
${lines.join('\n')}`
}

/** One compact line per item; the model sees just enough to judge relevance. */
function toItemLine(index: number, title: string, snippet: string): string {
  return `${index}. ${title}: ${snippet.slice(0, SNIPPET_MAX_CHARS)}`
}

/**
 * Deterministic history boost: sources whose items get approved rank higher,
 * heavily-discarded sources sink — bounded so history can never fully
 * override the relevance judgment.
 */
export function computeSourceBoost(
  stats: SourceUsageStats | undefined
): number {
  if (!stats) return 0
  const raw = Math.log2(stats.approvedCount + 1) - Math.log2(stats.discardedCount + 1)
  return Math.max(-RANK_BOOST_CLAMP, Math.min(RANK_BOOST_CLAMP, raw))
}

/** Score+boost >= threshold, at most RANK_PER_PILLAR_CAP per bestPillar, then the global cap — original order breaks ties. */
function selectTop<T extends { clientSourceId?: string }>(
  items: T[],
  rankings: Map<number, Ranking>,
  offset: number,
  globalCap: number,
  statsBySource: Map<string, SourceUsageStats>
): T[] {
  const scored = items
    .map((item, i) => {
      const ranking = rankings.get(offset + i + 1)
      if (!ranking) return null
      const boost = computeSourceBoost(
        item.clientSourceId ? statsBySource.get(item.clientSourceId) : undefined
      )
      return { item, adjusted: ranking.score + boost, bestPillar: ranking.bestPillar }
    })
    .filter(
      (entry): entry is { item: T; adjusted: number; bestPillar: string | null } =>
        entry !== null && entry.adjusted >= RANK_SCORE_THRESHOLD
    )
    .sort((a, b) => b.adjusted - a.adjusted)

  const perPillar = new Map<string, number>()
  const selected: T[] = []
  for (const { item, bestPillar } of scored) {
    if (selected.length >= globalCap) break
    const pillarKey = bestPillar ?? ''
    if (pillarKey) {
      const used = perPillar.get(pillarKey) ?? 0
      if (used >= RANK_PER_PILLAR_CAP) continue
      perPillar.set(pillarKey, used + 1)
    }
    selected.push(item)
  }
  return selected
}

/**
 * Rank rss + web-search items by business relevance in one cold Haiku call and
 * keep only the strongest, so topic generation reads a curated shortlist.
 * Website/file excerpts pass through untouched (few, large, already curated).
 * Any failure or empty selection returns the input unchanged — ranking must
 * never lose a run.
 */
export async function rankSourceItems(
  context: SourceContext,
  opts: RankOptions
): Promise<SourceContext> {
  const rssItems: RssItem[] = context.rssItems
  const webItems: TrendSearchResult[] = context.webSearchItems ?? []
  const totalItems = rssItems.length + webItems.length

  if (totalItems < RANK_MIN_ITEMS) return context

  const lines = [
    ...rssItems.map((item, i) => toItemLine(i + 1, item.title, item.description)),
    ...webItems.map((item, i) => toItemLine(rssItems.length + i + 1, item.title, item.snippet)),
  ]

  try {
    const message = await callAnthropic({
      systemPrompt: RANK_SYSTEM_PROMPT,
      userMessage: buildRankUserPrompt(lines, opts),
      model: LIGHT_MODEL,
      maxTokens: 2048,
      outputSchema: RANK_OUTPUT_SCHEMA,
      temperature: 0,
    })

    // Schema passed so a rankings array returned as a JSON-encoded string is
    // repaired rather than dropped — losing it silently reverts to unranked order.
    const { rankings } = extractToolInput<{ rankings: Ranking[] }>(message, RANK_OUTPUT_SCHEMA)
    const byIndex = new Map<number, Ranking>()
    for (const ranking of Array.isArray(rankings) ? rankings : []) {
      if (typeof ranking.index === 'number') byIndex.set(ranking.index, ranking)
    }

    const statsBySource = new Map(
      (opts.sourceStats ?? []).map((stat) => [stat.clientSourceId, stat])
    )
    const rankedRss = selectTop(rssItems, byIndex, 0, RANKED_RSS_CAP, statsBySource)
    // A run with briefs earns extra web slots: a brief's material must not be
    // squeezed out of the fixed cap by strong-but-generic niche items.
    const webCap = RANKED_WEB_CAP + (opts.focusTexts?.length ?? 0)
    const rankedWeb = selectTop(webItems, byIndex, rssItems.length, webCap, statsBySource)

    // Everything filtered = the ranker is wrong, not the sources — keep the run alive
    if (rankedRss.length + rankedWeb.length === 0) {
      console.warn('[research] rank stage filtered every item — using unranked context')
      return context
    }

    return {
      ...context,
      rssItems: rankedRss,
      ...(context.webSearchItems ? { webSearchItems: rankedWeb } : {}),
    }
  } catch (err) {
    console.warn('[research] rank stage failed, using unranked context:', err)
    return context
  }
}

import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { parseJsonResponse } from '@/utils/ai'
import { shuffleArray } from '@/utils/shuffle'
import { interleaveRoundRobin } from '@/utils/interleave'
import { queryTavily } from '@/lib/sources/tavily-client'
import type { WeightedPillar } from '@/lib/clients/content-pillars'
import type { TavilyConfig } from '@/types/sources'

export interface ClientSearchContext {
  targetAudience?: string
  /**
   * User-supplied topics — a client idea or a priority brief. Each gets a search
   * query written about it, alongside the niche/pillar queries. Without these a
   * brief is searched for as though it were the client's niche, which returns
   * material about the business rather than about what was actually asked for.
   */
  focusTexts?: string[]
  contentPillars?: WeightedPillar[]
  postHistory?: string[]
  language?: string
  excludedUrls?: string[]
  tavilyConfig?: TavilyConfig
}

function toSearchQuery(niche: string): string {
  // Strip verbose tail: "... specializing in X", "... focusing on Y", "... dedicated to Z"
  const [head] = niche.split(/\s+(?:specializing|focusing|dedicated)\b/i)
  const base = (head ?? niche).trim()
  // Cap at 5 words to prevent overly narrow queries
  const words = base.split(/\s+/)
  const short = words.length > 5 ? words.slice(0, 5).join(' ') : base
  return `${short} trends`
}

/**
 * Uses Claude Haiku to generate multiple diverse, pillar-specific search queries.
 * Each query targets a different content pillar or angle.
 * Falls back to [{ query: toSearchQuery(niche) }] on any error.
 */
async function generateSearchQueries(
  niche: string,
  context: ClientSearchContext,
  count: number,
): Promise<string[]> {
  const monthYear = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })

  const pillarsText =
    context.contentPillars && context.contentPillars.length > 0
      ? context.contentPillars
          .sort((a, b) => b.weight - a.weight)
          .map((p) => `- ${p.pillar} (${p.weight}%)`)
          .join('\n')
      : ''

  const historyText =
    context.postHistory && context.postHistory.length > 0
      ? `\nAlready covered — avoid these angles: ${context.postHistory.slice(0, 10).join(', ')}`
      : ''

  const focusText =
    context.focusTexts && context.focusTexts.length > 0
      ? `\nThe client has asked for posts on these specific subjects. Write one query for EACH, about the subject itself — not about the business:\n${context.focusTexts.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n`
      : ''

  try {
    const message = await callAnthropic({
      model: LIGHT_MODEL,
      systemPrompt: `You generate web search queries for a social media content pipeline.
A good query is 4-8 words, specific to the exact business type, and would return
results useful to a practitioner in that field — not generic industry content.

BAD: "aesthetic medicine trends 2026" — too broad, any clinic could use this
GOOD: "polynucleotide PDRN skin regeneration clinical results 2026" — specific treatment, current data`,
      userMessage: `Generate ${count} search queries for ${monthYear}.

Business: ${niche}
Audience: ${context.targetAudience ?? 'general'}
${pillarsText ? `\nContent pillars:\n${pillarsText}` : ''}
${historyText}
${focusText}
Rules:
- Each query covers a DIFFERENT pillar or angle — no overlapping topics
- Mix languages: some in ${context.language ?? 'English'} for local market, some in English for research
- Include the year for freshness
- Every query must be specific enough that only results relevant to THIS business type appear

Return JSON only:
["exact search string", "another search string"]`,
      assistantPrefill: '[',
      cacheSystemPrompt: true,
    })

    return parseJsonResponse<string[]>(message, 'array', '[')
  } catch {
    return [toSearchQuery(niche)]
  }
}

export interface TrendSearchResult {
  title: string
  snippet: string
  url: string
  score: number
  eligiblePillars?: string[]
  /** The tavily client_sources row id — feeds the rank-stage approval boost. */
  clientSourceId?: string
}

const TIME_RANGES = ['week', 'month', '3months'] as const

/**
 * Executes a batch of Tavily queries in parallel and deduplicates by URL.
 * Returns one group of results per query, aligned with `queries` — the capping
 * step interleaves groups round-robin, so flattening here would let one prolific
 * query crowd the others (including a brief's focus query) out of the cap.
 */
async function runTavilyQueries(
  queries: string[],
  perQueryMax: number,
  scoreThreshold: number,
  timeRangeOverride?: string,
  searchDepth: 'basic' | 'advanced' = 'basic',
  includeDomains?: string[],
  excludeDomains?: string[],
): Promise<TrendSearchResult[][]> {
  const results = await Promise.allSettled(
    queries.map(async (query, i) => {
      const hits = await queryTavily(query, {
        topic: i % 2 === 0 ? 'news' : 'general',
        timeRange: timeRangeOverride ?? TIME_RANGES[i % TIME_RANGES.length],
        searchDepth,
        maxResults: Math.min(perQueryMax, 10),
        includeDomains,
        excludeDomains,
      })
      return hits.map((r) => ({
        title: r.title,
        snippet: r.content,
        url: r.url,
        score: r.score,
      }))
    }),
  )

  const rawGroups = results.map((r) => (r.status === 'fulfilled' ? r.value : []))
  return dedupeIntoGroups(rawGroups, scoreThreshold)
}

/**
 * Global URL de-dupe that keeps each surviving item in its query's group. A URL
 * two queries both found keeps its higher-scoring copy, in that copy's group,
 * so the round-robin cap never counts one article twice.
 */
export function dedupeIntoGroups(
  rawGroups: TrendSearchResult[][],
  scoreThreshold: number
): TrendSearchResult[][] {
  const bestByUrl = new Map<string, { item: TrendSearchResult; group: number }>()
  rawGroups.forEach((groupItems, groupIndex) => {
    for (const item of groupItems) {
      if (item.score < scoreThreshold) continue
      const existing = bestByUrl.get(item.url)
      if (!existing || item.score > existing.item.score) {
        bestByUrl.set(item.url, { item, group: groupIndex })
      }
    }
  })

  const groups: TrendSearchResult[][] = rawGroups.map(() => [])
  for (const { item, group } of bestByUrl.values()) groups[group]?.push(item)
  return groups
}

/**
 * Search for current trending content in a niche using Tavily.
 * When clientContext is provided, uses Claude Haiku to generate
 * multiple pillar-specific queries and runs them in parallel —
 * produces varied, deduplicated results across runs.
 *
 * Two-pass strategy:
 * - Pass 1: recent articles (week/month/3months), strict threshold (0.3)
 * - Pass 2 (only if pass 1 yields nothing): broad query, year range, lower threshold (0.15)
 *
 * Returns [] immediately if TAVILY_API_URL_KEY is not set or on any error.
 */
export async function searchTrends(
  niche: string,
  count: number,
  clientContext?: ClientSearchContext,
): Promise<TrendSearchResult[]> {
  const key = process.env.TAVILY_API_URL_KEY
  if (!key) return []

  // Always generate at least 3 queries to ensure pool diversity, even for small
  // counts, plus one per requested subject so no brief goes unsearched.
  const focusCount = clientContext?.focusTexts?.length ?? 0
  const queryCount = clientContext ? Math.max(3, Math.min(count + 1, 5)) + focusCount : 1
  const queries = clientContext
    ? await generateSearchQueries(niche, clientContext, queryCount)
    : [toSearchQuery(niche)]

  const perQueryMax = Math.ceil((count * 3) / queries.length)

  const includeDomains = clientContext?.tavilyConfig?.include_domains
  const excludeDomains = clientContext?.tavilyConfig?.exclude_domains

  try {
    // Pass 1: recent articles, strict relevance threshold
    let groups = await runTavilyQueries(queries, perQueryMax, 0.3, undefined, 'basic', includeDomains, excludeDomains)

    // Pass 2: only if pass 1 yielded nothing — broader time range, lower threshold
    if (groups.every((g) => g.length === 0)) {
      const fallbackQuery = [`${toSearchQuery(niche)} ${new Date().getFullYear()}`]
      groups = await runTavilyQueries(fallbackQuery, count + 2, 0.15, 'year', 'advanced', includeDomains, excludeDomains)
    }

    // Filter out URLs already used in previous posts, then cap fairly: shuffle
    // WITHIN each query's group for run-to-run variety, and interleave across
    // groups so every query — a brief's focus query included — keeps a share of
    // the cap instead of gambling on a global shuffle.
    const excluded = new Set(clientContext?.excludedUrls ?? [])
    const cappedGroups = groups.map((g) => shuffleArray(g.filter((r) => !excluded.has(r.url))))

    return interleaveRoundRobin(cappedGroups, count + 2 + focusCount)
  } catch {
    return []
  }
}

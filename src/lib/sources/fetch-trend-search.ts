import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { parseJsonResponse } from '@/utils/ai'
import { shuffleArray } from '@/utils/shuffle'
import { TAVILY_API_URL } from '@/utils/constants'
import type { WeightedPillar } from '@/lib/clients/content-pillars'
import type { TavilyConfig } from '@/types/sources'

export interface ClientSearchContext {
  targetAudience?: string
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
): Promise<Array<{ query: string; pillar: string }>> {
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

Rules:
- Each query covers a DIFFERENT pillar or angle — no overlapping topics
- Mix languages: some in ${context.language ?? 'English'} for local market, some in English for research
- Include the year for freshness
- Every query must be specific enough that only results relevant to THIS business type appear

Return JSON only:
[{ "query": "exact search string", "pillar": "pillar name this serves" }]`,
      assistantPrefill: '[',
      cacheSystemPrompt: true,
    })

    return parseJsonResponse<Array<{ query: string; pillar: string }>>(message, 'array', '[')
  } catch {
    return [{ query: toSearchQuery(niche), pillar: 'general' }]
  }
}

export interface TrendSearchResult {
  title: string
  snippet: string
  url: string
  score: number
  eligiblePillars?: string[]
}

const TIME_RANGES = ['week', 'month', '3months'] as const

/**
 * Executes a batch of Tavily queries in parallel, merges results, and deduplicates by URL.
 * Returns all results scoring at or above scoreThreshold.
 */
async function runTavilyQueries(
  key: string,
  queries: Array<{ query: string; pillar: string }>,
  perQueryMax: number,
  scoreThreshold: number,
  timeRangeOverride?: string,
  searchDepth: 'basic' | 'advanced' = 'basic',
  includeDomains?: string[],
  excludeDomains?: string[],
): Promise<TrendSearchResult[]> {
  const results = await Promise.allSettled(
    queries.map(async ({ query }, i) => {
      const topic = i % 2 === 0 ? 'news' : 'general'
      const time_range = timeRangeOverride ?? TIME_RANGES[i % TIME_RANGES.length]
      const res = await fetch(TAVILY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: key,
          query,
          topic,
          time_range,
          search_depth: searchDepth,
          max_results: Math.min(perQueryMax, 10),
          ...(includeDomains?.length ? { include_domains: includeDomains } : {}),
          ...(excludeDomains?.length ? { exclude_domains: excludeDomains } : {}),
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return []
      const data = (await res.json()) as {
        results?: Array<{ title: string; url: string; content: string; score: number }>
      }
      return (data.results ?? []).map((r) => ({
        title: r.title,
        snippet: r.content,
        url: r.url,
        score: r.score,
      }))
    }),
  )

  const byUrl = new Map<string, TrendSearchResult>()
  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const item of result.value) {
        if (item.score < scoreThreshold) continue
        const existing = byUrl.get(item.url)
        if (!existing || item.score > existing.score) {
          byUrl.set(item.url, item)
        }
      }
    }
  }
  return [...byUrl.values()]
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

  // Always generate at least 3 queries to ensure pool diversity, even for small counts
  const queryCount = clientContext ? Math.max(3, Math.min(count + 1, 5)) : 1
  const queries = clientContext
    ? await generateSearchQueries(niche, clientContext, queryCount)
    : [{ query: toSearchQuery(niche), pillar: 'general' }]

  const perQueryMax = Math.ceil((count * 3) / queries.length)

  const includeDomains = clientContext?.tavilyConfig?.include_domains
  const excludeDomains = clientContext?.tavilyConfig?.exclude_domains

  try {
    // Pass 1: recent articles, strict relevance threshold
    let pool = await runTavilyQueries(key, queries, perQueryMax, 0.3, undefined, 'basic', includeDomains, excludeDomains)

    // Pass 2: only if pass 1 yielded nothing — broader time range, lower threshold
    if (pool.length === 0) {
      const fallbackQuery = [{ query: `${toSearchQuery(niche)} ${new Date().getFullYear()}`, pillar: 'general' }]
      pool = await runTavilyQueries(key, fallbackQuery, count + 2, 0.15, 'year', 'advanced', includeDomains, excludeDomains)
    }

    // Filter out URLs already used in previous posts
    const excluded = new Set(clientContext?.excludedUrls ?? [])
    const filtered = pool.filter((r) => !excluded.has(r.url))

    return shuffleArray(filtered).slice(0, count + 2)
  } catch {
    return []
  }
}

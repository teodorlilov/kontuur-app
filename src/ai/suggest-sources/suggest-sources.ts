import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { parseJsonResponse } from '@/utils/ai'
import { discoverFeedUrl } from '@/lib/sources/discover-feed-url'
import { TAVILY_API_URL } from '@/utils/constants'

export interface SuggestSourcesInput {
  niche: string
  clientName?: string
}

export interface SuggestedSource {
  url: string
  label: string
  reason: string
}

interface TavilyResult {
  title: string
  url: string
  content: string
  score: number
}

/**
 * Generate search queries to find niche-relevant blogs and RSS sources via Tavily.
 */
async function generateSearchQueries(niche: string): Promise<string[]> {
  try {
    const message = await callAnthropic({
      model: LIGHT_MODEL,
      maxTokens: 256,
      systemPrompt: 'You generate web search queries to find blogs and news sites with RSS feeds.',
      userMessage: `Generate 3 search queries to find blogs, news sites, and publications that publish RSS feeds relevant to this niche: "${niche}".

Each query should target a different angle: industry blogs, professional news, niche publications.
Include "blog" or "RSS" in at least 2 queries for better results.

Return JSON only: ["query1", "query2", "query3"]`,
      assistantPrefill: '[',
      cacheSystemPrompt: false,
    })
    return parseJsonResponse<string[]>(message, 'array', '[')
  } catch {
    return [`${niche} blog RSS feed`, `${niche} industry news`]
  }
}

/**
 * Search Tavily for websites matching a query.
 */
async function searchTavily(query: string, maxResults: number): Promise<TavilyResult[]> {
  const key = process.env.TAVILY_API_URL_KEY
  if (!key) return []

  const res = await fetch(TAVILY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      topic: 'general',
      search_depth: 'basic',
      max_results: maxResults,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return []

  const data = (await res.json()) as { results?: TavilyResult[] }
  return data.results ?? []
}

/**
 * Deduplicate Tavily results by domain, keeping the highest-scored entry per domain.
 */
function deduplicateByDomain(results: TavilyResult[]): TavilyResult[] {
  const byDomain = new Map<string, TavilyResult>()
  for (const r of results) {
    let domain: string
    try {
      domain = new URL(r.url).hostname
    } catch {
      continue
    }
    const existing = byDomain.get(domain)
    if (!existing || r.score > existing.score) {
      byDomain.set(domain, r)
    }
  }
  return [...byDomain.values()]
}

/**
 * Suggest RSS feeds by searching Tavily for niche-relevant sites and discovering their feeds.
 */
export async function suggestSources(input: SuggestSourcesInput): Promise<SuggestedSource[]> {
  const queries = await generateSearchQueries(input.niche)

  const searchResults = await Promise.allSettled(queries.map((q) => searchTavily(q, 5)))

  const allResults: TavilyResult[] = []
  for (const result of searchResults) {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value)
    }
  }

  const unique = deduplicateByDomain(allResults)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  // Discover RSS feeds for each unique site in parallel
  const discoveries = await Promise.allSettled(
    unique.map(async (r) => {
      const feedUrl = await discoverFeedUrl(r.url)
      if (!feedUrl) return null
      return { url: feedUrl, label: r.title, reason: r.content.slice(0, 150) }
    })
  )

  const suggestions: SuggestedSource[] = []
  for (const result of discoveries) {
    if (result.status === 'fulfilled' && result.value) {
      suggestions.push(result.value)
    }
  }

  return suggestions.slice(0, 5)
}

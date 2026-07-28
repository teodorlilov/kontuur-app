import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { parseJsonResponse } from '@/utils/ai'
import { discoverFeedUrl } from '@/lib/sources/discover-feed-url'
import { validateSourceUrl } from '@/lib/sources/validate-url'
import { TAVILY_API_URL } from '@/utils/constants'

export interface SuggestSourcesInput {
  niche: string
  clientName?: string
  pillars?: string[]
  targetAudience?: string
  language?: string
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

const QUERY_COUNT = 4
const RESULTS_PER_QUERY = 6
const MIN_TAVILY_SCORE = 0.2
const MAX_CANDIDATE_SITES = 12
const MAX_SUGGESTIONS = 8
const CACHE_TTL_MS = 10 * 60_000

/**
 * Generate publisher-targeted search queries (blogs, magazines, news sites)
 * using the client's niche, audience, and content pillars.
 */
async function generateSearchQueries(input: SuggestSourcesInput): Promise<string[]> {
  const pillarsText =
    input.pillars && input.pillars.length > 0
      ? `\nContent topics:\n${input.pillars.map((p) => `- ${p}`).join('\n')}`
      : ''

  try {
    const message = await callAnthropic({
      model: LIGHT_MODEL,
      maxTokens: 256,
      systemPrompt: `You generate web search queries to find blogs, news sites, and industry publications that publish RSS/Atom feeds.
Queries must surface PUBLISHERS (blogs, magazines, trade news sites), not individual articles.`,
      userMessage: `Generate ${QUERY_COUNT} search queries to find publications worth following for this business.

Business: ${input.niche}${input.clientName ? ` (${input.clientName})` : ''}
Audience: ${input.targetAudience ?? 'general'}${pillarsText}

Rules:
- Each query targets a DIFFERENT topic or angle — no overlapping queries
- Queries should find publishers a social media manager would mine for post ideas
- Include "blog" or "news" in at least 2 queries
${input.language && input.language.toLowerCase() !== 'english' ? `- Mix languages: some queries in ${input.language}, some in English` : ''}

Return JSON only: ["query1", "query2", "query3", "query4"]`,
      assistantPrefill: '[',
      cacheSystemPrompt: false,
    })
    const queries = parseJsonResponse<string[]>(message, 'array', '[')
    return queries.length > 0 ? queries : fallbackQueries(input.niche)
  } catch {
    return fallbackQueries(input.niche)
  }
}

function fallbackQueries(niche: string): string[] {
  return [`${niche} blog`, `${niche} industry news site`]
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
 * Re-rank discovered feeds by relevance to the business and rewrite each
 * reason as one plain-language sentence. Falls back to the input order on
 * any model or parse failure.
 */
async function rerankSuggestions(
  input: SuggestSourcesInput,
  candidates: SuggestedSource[]
): Promise<SuggestedSource[]> {
  if (candidates.length === 0) return candidates

  const list = candidates
    .map((c, i) => `${i + 1}. ${c.label} — ${c.url}\n   ${c.reason}`)
    .join('\n')

  try {
    const message = await callAnthropic({
      model: LIGHT_MODEL,
      maxTokens: 512,
      systemPrompt:
        'You rank content publications by how useful they are as post-idea sources for a specific business.',
      userMessage: `Business: ${input.niche}${input.clientName ? ` (${input.clientName})` : ''}
Audience: ${input.targetAudience ?? 'general'}${
        input.pillars && input.pillars.length > 0 ? `\nTopics: ${input.pillars.join(', ')}` : ''
      }

Candidate publications:
${list}

Rules:
- Keep only publications a social media manager for THIS business would mine for post ideas
- Drop generic news portals, aggregators, and off-topic sites
- Order the kept ones most-relevant first
- "reason" is ONE short plain sentence saying why it's useful for this business

Return JSON only: [{ "index": 1, "keep": true, "reason": "..." }]`,
      assistantPrefill: '[',
      cacheSystemPrompt: false,
    })

    const ranked = parseJsonResponse<Array<{ index: number; keep: boolean; reason?: string }>>(
      message,
      'array',
      '['
    )
    if (ranked.length === 0) return candidates

    const result: SuggestedSource[] = []
    for (const item of ranked) {
      const candidate = candidates[item.index - 1]
      if (!candidate || !item.keep) continue
      result.push({ ...candidate, reason: item.reason?.trim() || candidate.reason })
    }
    return result.length > 0 ? result : candidates
  } catch {
    return candidates
  }
}

/**
 * Suggest feeds by searching Tavily for niche-relevant publishers, discovering
 * their RSS/Atom feeds, and re-ranking the survivors by relevance.
 */
export async function suggestSources(input: SuggestSourcesInput): Promise<SuggestedSource[]> {
  const queries = await generateSearchQueries(input)

  const searchResults = await Promise.allSettled(
    queries.map((q) => searchTavily(q, RESULTS_PER_QUERY))
  )

  const allResults: TavilyResult[] = []
  for (const result of searchResults) {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value)
    }
  }

  const unique = deduplicateByDomain(allResults)
    .filter((r) => r.score >= MIN_TAVILY_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATE_SITES)

  // SSRF parity with source creation: only fetch publicly routable URLs
  const urlChecks = await Promise.all(unique.map((r) => validateSourceUrl(r.url)))
  const safe = unique.filter((_, i) => urlChecks[i])

  // Discover feeds in parallel; sites without a working feed are dropped
  const discoveries = await Promise.allSettled(
    safe.map(async (r) => {
      const feedUrl = await discoverFeedUrl(r.url)
      if (!feedUrl) return null
      return { url: feedUrl, label: r.title, reason: r.content.slice(0, 150) }
    })
  )

  const candidates: SuggestedSource[] = []
  const seenFeedUrls = new Set<string>()
  for (const result of discoveries) {
    if (result.status !== 'fulfilled' || !result.value) continue
    if (seenFeedUrls.has(result.value.url)) continue
    seenFeedUrls.add(result.value.url)
    candidates.push(result.value)
  }

  const ranked = await rerankSuggestions(input, candidates)
  return ranked.slice(0, MAX_SUGGESTIONS)
}

const cache = new Map<string, { at: number; suggestions: SuggestedSource[] }>()

/**
 * Cached wrapper around suggestSources — repeated requests for the same
 * agency + niche reuse results for 10 minutes (in-memory, per-instance,
 * same caveat as rate-limit.ts).
 */
export async function suggestSourcesCached(
  agencyId: string,
  input: SuggestSourcesInput
): Promise<SuggestedSource[]> {
  const key = `${agencyId}:${input.niche.trim().toLowerCase()}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.suggestions

  const suggestions = await suggestSources(input)
  if (suggestions.length > 0) {
    cache.set(key, { at: Date.now(), suggestions })
  }
  return suggestions
}

import { TAVILY_API_URL } from '@/utils/constants'
import { currentSpender } from '@/lib/billing/spend-context'
import { recordAiUsage } from '@/lib/billing/telemetry'

/** One raw Tavily hit, as the API returns it. */
export interface TavilyHit {
  title: string
  url: string
  content: string
  score: number
}

interface TavilyQueryOptions {
  maxResults: number
  topic?: 'news' | 'general'
  timeRange?: string
  searchDepth?: 'basic' | 'advanced'
  includeDomains?: string[]
  excludeDomains?: string[]
}

/**
 * The one Tavily HTTP call. Trend search and source suggestion each carried
 * their own copy — separate env reads, timeout literals and result types that
 * had already drifted — so the wire contract lives here and callers keep only
 * what genuinely differs: scoring thresholds, dedupe and result shaping.
 *
 * Returns [] when the key is unset or the API answers non-OK; a network failure
 * or timeout rejects, matching what both callers already handle. Refused outright when no
 * spender is in scope (src/lib/billing/spend-context.ts), and each query is recorded to
 * `ai_usage_daily` for the one that is.
 */
export async function queryTavily(query: string, opts: TavilyQueryOptions): Promise<TavilyHit[]> {
  if (!currentSpender()) {
    throw new Error('queryTavily: no spender in scope — wrap the boundary in runAsSpender')
  }
  const key = process.env.TAVILY_API_URL_KEY
  if (!key) return []
  void recordAiUsage({ provider: 'tavily' })

  const res = await fetch(TAVILY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      topic: opts.topic ?? 'general',
      search_depth: opts.searchDepth ?? 'basic',
      max_results: opts.maxResults,
      ...(opts.timeRange ? { time_range: opts.timeRange } : {}),
      ...(opts.includeDomains?.length ? { include_domains: opts.includeDomains } : {}),
      ...(opts.excludeDomains?.length ? { exclude_domains: opts.excludeDomains } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return []

  const data = (await res.json()) as { results?: TavilyHit[] }
  return data.results ?? []
}

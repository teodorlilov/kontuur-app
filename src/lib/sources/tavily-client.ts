import { z } from 'zod'
import { TAVILY_API_URL } from '@/utils/constants'
import { requireSpender } from '@/lib/billing/spend-context'
import { recordAiUsage } from '@/lib/billing/telemetry'

/**
 * One Tavily hit, holding only the fields callers read: source suggestion dedupes and ranks on
 * `url` and `score` and labels with `title` and `content`; trend search maps all four. A hit
 * missing any of them is dropped rather than defaulted, since a blank snippet or a zero score
 * would read as the search's own answer.
 */
const tavilyHitSchema = z.object({
  title: z.string(),
  url: z.string(),
  content: z.string(),
  score: z.number(),
})

/** One Tavily hit as `queryTavily` hands it on. */
export type TavilyHit = z.infer<typeof tavilyHitSchema>

/** Tavily's answer: the hits are checked one by one, so one bad hit does not sink the rest. */
const tavilyAnswerSchema = z.object({ results: z.array(z.unknown()).optional() })

interface TavilyQueryOptions {
  maxResults: number
  topic?: 'news' | 'general'
  timeRange?: string
  searchDepth?: 'basic' | 'advanced'
  includeDomains?: string[]
  excludeDomains?: string[]
}

/**
 * The hits in one Tavily answer, each checked against `tavilyHitSchema`. An answer of the wrong
 * shape is logged and reads as no hits; malformed hits are dropped with one warning, because an
 * empty or thinned search would otherwise read as "nothing found".
 */
function readHits(body: unknown): TavilyHit[] {
  const answer = tavilyAnswerSchema.safeParse(body)
  if (!answer.success) {
    console.error('[tavily] unexpected answer shape; returning no hits:', answer.error.message)
    return []
  }
  const raw = answer.data.results ?? []
  const hits = raw
    .map((hit) => tavilyHitSchema.safeParse(hit))
    .flatMap((parsed) => (parsed.success ? [parsed.data] : []))
  if (hits.length < raw.length) {
    console.warn(`[tavily] dropped ${raw.length - hits.length} of ${raw.length} malformed hit(s)`)
  }
  return hits
}

/**
 * The one Tavily HTTP call: the wire contract lives here, and callers keep only what genuinely
 * differs — scoring thresholds, dedupe and result shaping.
 *
 * Returns [] quietly when the key is unset, and logged when the API answers non-OK or out of shape
 * (`readHits`). A network failure, a timeout or a body that is not JSON rejects, which both
 * callers handle. Refused outright when no spender is in scope (`requireSpender`,
 * src/lib/billing/spend-context.ts), and each query is recorded to `ai_usage_daily` for the one
 * that is.
 */
export async function queryTavily(query: string, opts: TavilyQueryOptions): Promise<TavilyHit[]> {
  const spender = requireSpender()
  const key = process.env.TAVILY_API_URL_KEY
  if (!key) return []
  void recordAiUsage(spender, { provider: 'tavily' })

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
  if (!res.ok) {
    console.error(`[tavily] search answered ${res.status}; returning no hits`)
    return []
  }

  return readHits(await res.json())
}

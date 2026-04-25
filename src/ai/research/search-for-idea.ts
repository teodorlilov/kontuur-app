import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchClientSources } from '@/lib/queries/db'
import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { TAVILY_API_URL } from '@/utils/constants'
import type { TavilyConfig } from '@/types/sources'

interface IdeaSearchResult {
  url: string
  title: string
  excerpt: string
}

interface TavilyResult {
  title: string
  url: string
  content: string
  score: number
}

/** Checks whether a Tavily result actually relates to the idea topic. */
async function isResultRelevant(
  ideaText: string,
  resultTitle: string,
  resultExcerpt: string,
): Promise<boolean> {
  try {
    const message = await callAnthropic({
      model: LIGHT_MODEL,
      maxTokens: 8,
      systemPrompt: 'You verify whether a search result is relevant to a given topic. Reply YES or NO only.',
      userMessage: `Topic: "${ideaText}"\n\nArticle title: "${resultTitle}"\nArticle excerpt: "${resultExcerpt.slice(0, 300)}"\n\nDoes this article directly relate to the topic? Reply YES or NO only.`,
    })
    const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
    return text.toUpperCase().includes('YES')
  } catch {
    return false
  }
}

/** Runs a focused Tavily search using the idea text as query. Returns the best relevant result or null. */
export async function searchForIdea(
  supabase: SupabaseClient,
  clientId: string,
  ideaText: string,
): Promise<IdeaSearchResult | null> {
  const sources = await fetchClientSources(supabase, clientId)
  const tavilyRow = sources.find((r) => r.type === 'tavily')
  if (!tavilyRow) return null

  const tavilyConfig = (tavilyRow.config ?? {}) as TavilyConfig
  const key = process.env.TAVILY_API_URL_KEY
  if (!key) return null

  try {
    const res = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query: ideaText,
        topic: 'general',
        search_depth: 'advanced',
        max_results: 3,
        time_range: 'year',
        ...(tavilyConfig.include_domains?.length ? { include_domains: tavilyConfig.include_domains } : {}),
        ...(tavilyConfig.exclude_domains?.length ? { exclude_domains: tavilyConfig.exclude_domains } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null

    const data = (await res.json()) as { results?: TavilyResult[] }
    const results = data.results ?? []

    const relevance = await Promise.all(
      results.map((r) => isResultRelevant(ideaText, r.title, r.content))
    )
    const idx = relevance.indexOf(true)
    if (idx !== -1) {
      const r = results[idx]!
      return { url: r.url, title: r.title, excerpt: r.content }
    }

    return null
  } catch {
    return null
  }
}

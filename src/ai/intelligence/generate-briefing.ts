import type Anthropic from '@anthropic-ai/sdk'
import { anthropic, DEFAULT_MODEL } from '@/utils/ai-client'
import { sanitizeAndParseJson } from '@/utils/ai'
import { briefingItemSchema, type BriefingItem } from './schema'

/** A brief is at most this many changes; the prompt and the cap read the same number. */
const MAX_BRIEFING_ITEMS = 5

/** How many searches one brief may spend — enough for two networks and a follow-up read each. */
const MAX_SEARCHES = 8

/**
 * Where the search may read. Official Meta and Instagram newsrooms first, then the trade outlets
 * that report platform changes the day they land. A plain `string[]`, not `as const`: the SDK's
 * `allowed_domains` is `Array<string> | null`, which a readonly tuple does not assign to.
 */
const BRIEFING_SOURCE_DOMAINS: string[] = [
  'about.fb.com',
  'about.instagram.com',
  'creators.instagram.com',
  'business.instagram.com',
  'developers.facebook.com',
  'transparency.meta.com',
  'socialmediatoday.com',
  'later.com',
  'buffer.com',
  'hootsuite.com',
  'sproutsocial.com',
]

/** The days a brief covers: `since` inclusive to `until` exclusive, both `YYYY-MM-DD`. */
interface BriefingWindow {
  since: string
  until: string
}

/**
 * What one run produced: the verified items, and how many the model offered that no searched
 * page backed — the cron logs that count, so an over-strict filter cannot quietly turn every
 * week into "nothing changed".
 */
interface BriefingRun {
  items: BriefingItem[]
  unverified: number
}

/**
 * Asks for the changes themselves, never advice or a summary: the dashboard shows one headline
 * per row and nothing under it, so anything else the model writes has nowhere to go.
 */
function buildPrompt(window: BriefingWindow): string {
  return `You are a social media analyst. Use web search to find changes Instagram or Facebook made between ${window.since} and ${window.until} that affect how a business account should post: ranking or algorithm changes, features added or removed, format or aspect-ratio changes, policy changes.

Return ONLY a JSON array of up to ${MAX_BRIEFING_ITEMS} objects, newest first, with this exact shape:
[{ "network": "instagram" | "facebook", "title": "<one specific headline naming the change, under 90 characters>", "source_url": "<the URL of the page you read it on>" }]

Rules: one headline per change; no advice, no summaries of the week, no items you did not read on a page; every source_url must be a page returned by your search. If nothing changed in that window, return [].`
}

/** Web-search citations wrap quoted text in `<cite index="…">…</cite>`; inside JSON they break the parse. */
function stripCiteTags(text: string): string {
  return text.replace(/<cite[^>]*>([\s\S]*?)<\/cite>/g, '$1')
}

/**
 * A URL reduced to what identifies the page: lowercase host plus path without its trailing
 * slash. The model cites `https://about.fb.com/news/x/` where the search returned
 * `https://about.fb.com/news/x?utm_source=…`; comparing the raw strings drops a real item over
 * a slash or a tracking parameter. Null for anything `new URL` rejects.
 */
function pageKey(url: string): string | null {
  try {
    const { hostname, pathname } = new URL(url)
    return `${hostname.toLowerCase()}${pathname.replace(/\/$/, '')}`
  } catch {
    return null
  }
}

/**
 * Every page the search actually returned. A `web_search_tool_result` block carries a list of
 * results on success and a single error object on failure — the SDK types `content` as the
 * union — so a failed search contributes no pages rather than throwing on `.map`.
 */
function searchedPageKeys(content: Anthropic.ContentBlock[]): Set<string> {
  const keys = new Set<string>()
  for (const block of content) {
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue
    for (const result of block.content) {
      const key = pageKey(result.url)
      if (key) keys.add(key)
    }
  }
  return keys
}

/**
 * This week's platform changes, each backed by a page the search returned.
 *
 * The raw client rather than `callAnthropic`, which has no `tools` option. Two 5-series
 * decisions live here: `thinking` is omitted so Sonnet 5 runs adaptive thinking on its own, and
 * `max_tokens` is sized for that — thinking tokens count against it, and the old 2048 budget was
 * what made a searched-and-reasoned answer arrive truncated. `effort: 'low'` keeps the searches
 * consolidated; check `usage.server_tool_use.web_search_requests` before raising it.
 *
 * Verification is the whole point of the module: an item survives only if its `source_url`
 * names a page among the search results, compared by `pageKey`. The count of items that did not
 * survive is returned, not logged — the cron is the boundary, and it is the one that logs.
 *
 * Throws on any API failure, and on a response with no JSON array in it: `sanitizeAndParseJson`
 * hands back its fallback on a parse failure, and an `[]` fallback would have turned a broken
 * answer into a quiet "nothing changed" week. An honest `[]` from the model is a legitimate
 * week, not an error.
 */
export async function generateBriefing(window: BriefingWindow): Promise<BriefingRun> {
  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 16000,
    output_config: { effort: 'low' },
    tools: [
      {
        type: 'web_search_20260209',
        name: 'web_search',
        max_uses: MAX_SEARCHES,
        allowed_domains: BRIEFING_SOURCE_DOMAINS,
      },
    ],
    messages: [{ role: 'user', content: buildPrompt(window) }],
  })

  const text = stripCiteTags(
    response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
  )

  const parsed = sanitizeAndParseJson<unknown[] | null>(text, null, 'array')
  if (!Array.isArray(parsed)) {
    throw new Error(`briefing response held no JSON array (first 200 chars: ${text.slice(0, 200)})`)
  }

  const candidates = parsed
    .map((candidate) => briefingItemSchema.safeParse(candidate))
    .flatMap((result) => (result.success ? [result.data] : []))

  const searched = searchedPageKeys(response.content)
  const verified = candidates.filter((item) => {
    const key = pageKey(item.source_url)
    return key !== null && searched.has(key)
  })

  return {
    items: verified.slice(0, MAX_BRIEFING_ITEMS),
    unverified: candidates.length - verified.length,
  }
}

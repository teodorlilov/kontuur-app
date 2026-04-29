import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import { USER_AGENT_BROWSER } from '@/utils/constants'
import { readLimitedText } from './read-limited-text'

const FETCH_TIMEOUT = 8000
const MAX_HTML_BYTES = 500_000
const MIN_CONTENT_LENGTH = 200

const FETCH_HEADERS = {
  'User-Agent': USER_AGENT_BROWSER,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

/**
 * Fetches clean article text from a website by fetching HTML directly
 * and running Mozilla Readability to extract the main content.
 *
 * Returns plain text (no markdown, no images, no nav) capped at 8000 chars.
 */
export async function fetchWebsiteSource(
  url: string
): Promise<{ markdown: string; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const res = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS })
    if (!res.ok) return { markdown: '', error: `HTTP ${res.status}` }

    // Keep the timeout active during body reading — don't clearTimeout
    // until we have the full HTML (or the timeout fires and aborts).
    const rawHtml = await readLimitedText(res, MAX_HTML_BYTES)
    clearTimeout(timer)

    const { document } = parseHTML(rawHtml)
    const article = new Readability(document as unknown as Document).parse()

    if (!article?.textContent?.trim()) {
      return { markdown: '', error: 'No readable content found' }
    }

    const text = article.textContent.trim().replace(/\n{3,}/g, '\n\n').slice(0, 8000)
    if (text.length < MIN_CONTENT_LENGTH) return { markdown: '', error: 'Content too short' }

    return { markdown: text }
  } catch (err) {
    clearTimeout(timer)
    return { markdown: '', error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export interface WebsiteFetchResult {
  excerpts: Array<{ url: string; markdown: string }>
  error?: string
}

/**
 * Fetch a website source. If selected_pages are configured, picks random
 * pages from the user's selection and fetches them individually.
 * Otherwise fetches just the source URL.
 */
export async function fetchWebsiteWithSubpages(
  url: string,
  config: Record<string, unknown>,
  maxPages?: number
): Promise<WebsiteFetchResult> {
  const selectedPages = config.selected_pages as string[] | undefined

  if (selectedPages && selectedPages.length > 0) {
    const { pickRandom } = await import('./crawl-subpages')
    const maxCount = maxPages ?? 3
    const selected = pickRandom(selectedPages, maxCount)

    const results = await Promise.allSettled(
      selected.map(async (pageUrl) => {
        const { markdown, error } = await fetchWebsiteSource(pageUrl)
        if (error || markdown.length < MIN_CONTENT_LENGTH) return null
        return { url: pageUrl, markdown }
      })
    )

    const excerpts = results
      .filter(
        (r): r is PromiseFulfilledResult<{ url: string; markdown: string } | null> =>
          r.status === 'fulfilled'
      )
      .map((r) => r.value)
      .filter((r): r is { url: string; markdown: string } => r !== null)

    if (excerpts.length > 0) {
      return { excerpts }
    }

    // All selected pages failed — fall back to the source URL
  }

  // Fetch the source URL directly
  const main = await fetchWebsiteSource(url)
  if (main.error || !main.markdown) {
    return { excerpts: [], error: main.error }
  }

  return { excerpts: [{ url, markdown: main.markdown }] }
}

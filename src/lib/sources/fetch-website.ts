import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import { USER_AGENT_BROWSER } from '@/utils/constants'
import { readLimitedText } from './read-limited-text'

const FETCH_TIMEOUT = 8000
const MAX_HTML_BYTES = 500_000
const MIN_CONTENT_LENGTH = 200
/** Per-page character budget. Applied AFTER whitespace is collapsed, so it caps content, not layout. */
const MAX_CONTENT_CHARS = 8000

/**
 * Collapse a Readability dump's layout whitespace, keeping paragraph breaks.
 *
 * Readability preserves the source's indentation, so a template built from nested tables or a
 * page-builder yields runs of tabs on their own lines: measured on one real client homepage, 72%
 * of the extracted text was whitespace — 1,117 characters carrying 316 characters of content, at
 * full token price. It also eats the character budget, so a substantive page gets truncated
 * mid-sentence while a third of its allowance held indentation (5,599 → 6,888 characters of real
 * content under the same cap on that site's services page).
 *
 * `[^\S\n]` is "whitespace except newline": tabs, spaces, CR and non-breaking spaces collapse,
 * line structure survives. Paragraph breaks are kept at one blank line because they are the only
 * signal of where a section ends once the markup is gone.
 */
function collapseLayoutWhitespace(text: string): string {
  return text
    .replace(/[^\S\n]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const FETCH_HEADERS = {
  'User-Agent': USER_AGENT_BROWSER,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

/**
 * Fetches clean article text from a website by fetching HTML directly
 * and running Mozilla Readability to extract the main content.
 *
 * Returns plain text (no markdown, no images, no nav), whitespace-collapsed and capped at
 * `MAX_CONTENT_CHARS`.
 */
export async function fetchWebsiteSource(
  url: string
): Promise<{ markdown: string; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const res = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS })
    clearTimeout(timer)
    if (!res.ok) return { markdown: '', error: `HTTP ${res.status}` }

    const rawHtml = await readLimitedText(res, MAX_HTML_BYTES)
    const { document } = parseHTML(rawHtml)
    const article = new Readability(document as unknown as Document).parse()

    if (!article?.textContent?.trim()) {
      return { markdown: '', error: 'No readable content found' }
    }

    // Collapsed before the cap, so the budget is spent on content rather than indentation — and so
    // MIN_CONTENT_LENGTH measures a page's substance instead of how deeply its template nests.
    const text = collapseLayoutWhitespace(article.textContent).slice(0, MAX_CONTENT_CHARS)
    if (text.length < MIN_CONTENT_LENGTH) return { markdown: '', error: 'Content too short' }

    return { markdown: text }
  } catch (err) {
    clearTimeout(timer)
    return { markdown: '', error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export interface PageExcerpt {
  url: string
  markdown: string
}

interface WebsiteFetchResult {
  excerpts: PageExcerpt[]
  error?: string
}

/**
 * Fetch several pages at once, dropping the ones that came back empty or unreadable.
 *
 * Shared by the research pipeline's subpage sampling and the onboarding site profile — both need
 * "fetch these, keep what worked", and two copies of a settled-promise narrowing is exactly the
 * kind of duplication that drifts. `fetchWebsiteSource` already reports a too-short page as an
 * error, so `error` alone decides: re-checking the length here restated the same rule in a second
 * place, where it could disagree.
 */
export async function fetchPages(urls: string[]): Promise<PageExcerpt[]> {
  const results = await Promise.allSettled(
    urls.map(async (pageUrl): Promise<PageExcerpt | null> => {
      const { markdown, error } = await fetchWebsiteSource(pageUrl)
      return error || !markdown ? null : { url: pageUrl, markdown }
    })
  )
  return results.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []))
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
    const excerpts = await fetchPages(pickRandom(selectedPages, maxPages ?? 3))
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

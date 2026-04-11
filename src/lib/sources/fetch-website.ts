const MIN_CONTENT_LENGTH = 200

const LINK_LINE = /^\s*[-*]?\s*\[.*\]\(.*\)\s*$/
const IMAGE_LINE = /!\[Image\b/

/**
 * Remove navigation-heavy blocks from Jina markdown output.
 * Drops blocks where >60% of lines are markdown links (menus, sidebars, region lists).
 * Preserves short blocks (≤3 lines) to avoid stripping inline references.
 */
function stripNavigationBlocks(markdown: string): string {
  const blocks = markdown.split(/\n{2,}/)

  const kept = blocks
    .filter((block) => {
      const lines = block.split('\n').filter((l) => l.trim())
      if (lines.length <= 3) return true
      const linkCount = lines.filter((l) => LINK_LINE.test(l)).length
      return linkCount / lines.length < 0.6
    })
    .map((block) =>
      block
        .split('\n')
        .filter((l) => !IMAGE_LINE.test(l.trim()))
        .join('\n')
    )

  const result = kept
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return result.length >= MIN_CONTENT_LENGTH ? result : markdown
}

/**
 * Fetches clean markdown content from a website via Jina AI Reader.
 *
 * Free tier: 20 RPM without an API key (avg 7.9s latency).
 * Set JINA_API_KEY env var to access the 500 RPM free tier.
 * https://jina.ai/reader/
 */
export async function fetchWebsiteSource(
  url: string
): Promise<{ markdown: string; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  const headers: Record<string, string> = {
    Accept: 'text/plain',
    'X-Remove-Selector': 'nav, header, footer',
  }
  if (process.env.JINA_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`
  }

  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal: controller.signal,
      headers,
    })
    clearTimeout(timer)
    if (!res.ok) return { markdown: '', error: `HTTP ${res.status}` }
    // Overfetch since stripNavigationBlocks may remove a significant prefix
    const raw = (await res.text()).slice(0, 12000)
    const markdown = stripNavigationBlocks(raw).slice(0, 8000)
    return { markdown }
  } catch (err) {
    clearTimeout(timer)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { markdown: '', error: message }
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
    // Pick random pages from the user's selection
    const { pickRandom } = await import('./crawl-subpages')
    const hasApiKey = !!process.env.JINA_API_KEY
    const defaultMax = hasApiKey ? 5 : 2
    const maxCount = maxPages ?? defaultMax
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

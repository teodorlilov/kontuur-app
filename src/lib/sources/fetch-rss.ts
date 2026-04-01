/**
 * Regex-based RSS/Atom feed fetcher — no external XML parser dependency.
 * Handles RSS 2.0 and Atom, including CDATA-wrapped content.
 */

export interface RssItem {
  title: string
  description: string
  link: string
  pubDate: string | null
}
 
/**
 * Fetch and parse an RSS/Atom feed.
 * Default maxItems = 4: in the research API we cap total RSS items at 20,
 * so 4 per source × 5 sources = 20 items naturally.
 */
export async function fetchRssSource(
  url: string,
  maxItems = 4
): Promise<{ items: RssItem[]; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'PostflowBot/1.0' },
    })
    clearTimeout(timer)
    if (!res.ok) return { items: [], error: `HTTP ${res.status}` }
    const xml = await res.text()
    return { items: parseRssXml(xml, maxItems) }
  } catch (err) {
    clearTimeout(timer)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { items: [], error: message }
  }
}

/**
 * Quickly validate whether a URL serves a valid RSS/Atom feed.
 * Used during source creation and suggest-sources validation.
 */
export async function isValidRssUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'PostflowBot/1.0' },
    })
    if (!res.ok) return false
    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('xml') || ct.includes('rss') || ct.includes('atom')) return true
    // Fallback: scan first 500 bytes of body
    const text = await res.text()
    const head = text.slice(0, 500)
    return head.includes('<rss') || head.includes('<feed') || head.includes('<?xml')
  } catch {
    return false
  }
}

// ---- Internal helpers ----

function parseRssXml(xml: string, maxItems: number): RssItem[] {
  // Strip CDATA wrappers: <![CDATA[...]]> → raw content
  const clean = xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  const blocks = [...clean.matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, maxItems)
  return blocks
    .map((m) => {
      const b = m[0]
      return {
        title: extractTag(b, 'title'),
        description: stripHtml(extractTag(b, 'description')).slice(0, 300),
        link: extractTag(b, 'link'),
        pubDate: extractTag(b, 'pubDate') || null,
      }
    })
    .filter((item) => item.title || item.description)
}

function extractTag(xml: string, tag: string): string {
  return (
    xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1]?.trim() ?? ''
  )
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

import { isValidRssUrl } from '@/lib/sources/fetch-rss'
import { USER_AGENT_BOT } from '@/utils/constants'

const FETCH_TIMEOUT = 5000
const MAX_HEAD_BYTES = 50_000

const COMMON_FEED_PATHS = ['/feed', '/rss', '/rss.xml', '/feed.xml', '/atom.xml', '/blog/feed']

/**
 * Discover the RSS/Atom feed URL for a given website by inspecting HTML and probing common paths.
 */
export async function discoverFeedUrl(siteUrl: string): Promise<string | null> {
  let origin: string
  try {
    origin = new URL(siteUrl).origin
  } catch {
    return null
  }

  // Step 1: Check HTML <link> tags for feed references
  const feedFromHtml = await extractFeedFromHtml(siteUrl)
  if (feedFromHtml) return feedFromHtml

  // Step 2: Probe common feed paths in parallel
  const candidates = COMMON_FEED_PATHS.map((path) => `${origin}${path}`)
  const results = await Promise.allSettled(candidates.map((url) => probeUrl(url)))

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!
    if (result.status === 'fulfilled' && result.value) {
      return candidates[i]!
    }
  }

  return null
}

async function extractFeedFromHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      headers: { 'User-Agent': USER_AGENT_BOT },
    })
    if (!res.ok) return null
    const html = (await res.text()).slice(0, MAX_HEAD_BYTES)

    const linkRegex = /<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]*>/gi
    let match: RegExpExecArray | null

    while ((match = linkRegex.exec(html)) !== null) {
      const hrefMatch = match[0].match(/href=["']([^"']+)["']/)
      if (!hrefMatch?.[1]) continue

      const feedUrl = resolveUrl(hrefMatch[1], url)
      if (feedUrl && (await isValidRssUrl(feedUrl))) return feedUrl
    }
  } catch {
    // HTML fetch failed — fall through to path probing
  }
  return null
}

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).href
  } catch {
    return null
  }
}

async function probeUrl(url: string): Promise<boolean> {
  return isValidRssUrl(url)
}

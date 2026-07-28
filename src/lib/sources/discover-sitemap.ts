/**
 * Sitemap-based page discovery — finds content URLs from a website's sitemap.
 * No external XML parser — uses regex (same pattern as fetch-rss.ts).
 * Fetches sitemaps directly via fetch().
 */
import { USER_AGENT_BOT } from '@/utils/constants'

const MAX_URLS = 5000
const MAX_SUB_SITEMAPS = 15
const FETCH_TIMEOUT = 5000
const MAX_BODY_BYTES = 1_000_000 // 1MB

export interface SitemapDiscoveryResult {
  urls: string[]
  source: 'sitemap' | 'none'
}

/**
 * Discover content URLs from a website's sitemap, following index children automatically.
 * Tries: robots.txt → /sitemap.xml → /wp-sitemap.xml → /sitemap_index.xml
 * Sitemap-index children are fetched in parallel and merged, so callers
 * always receive one flat page list — never raw sitemap references.
 */
export async function discoverSitemapUrls(siteUrl: string): Promise<SitemapDiscoveryResult> {
  let origin: string
  try {
    origin = new URL(siteUrl).origin
  } catch {
    return { urls: [], source: 'none' }
  }

  // Step 1: Try robots.txt for Sitemap: directives
  const robotsTxt = await fetchXml(`${origin}/robots.txt`)
  let sitemapCandidates = robotsTxt ? parseSitemapFromRobotsTxt(robotsTxt) : []

  // Step 2: If robots.txt didn't yield sitemaps, try common locations
  const useFallbacks = sitemapCandidates.length === 0
  if (useFallbacks) {
    sitemapCandidates = [
      `${origin}/sitemap.xml`,
      `${origin}/wp-sitemap.xml`,
      `${origin}/sitemap_index.xml`,
    ]
  }

  const allUrls = new Set<string>()
  const allSitemapRefs = new Set<string>()

  for (const candidate of sitemapCandidates) {
    const xml = await fetchXml(candidate)
    if (!xml) continue

    const { urls, sitemapRefs } = parseSitemapXml(xml)
    for (const url of urls) allUrls.add(url)
    for (const ref of sitemapRefs) allSitemapRefs.add(ref)

    // For fallback candidates, stop at the first working sitemap
    if (useFallbacks) break
  }

  if (allSitemapRefs.size > 0) {
    for (const url of await followSitemapRefs([...allSitemapRefs])) allUrls.add(url)
  }

  if (allUrls.size === 0) {
    return { urls: [], source: 'none' }
  }

  return {
    urls: [...allUrls].slice(0, MAX_URLS),
    source: 'sitemap',
  }
}

/** Fetch sitemap-index children in parallel and merge their content URLs; failed children are skipped. */
async function followSitemapRefs(refs: string[]): Promise<string[]> {
  const toFollow = refs.slice(0, MAX_SUB_SITEMAPS)
  const results = await Promise.allSettled(toFollow.map((ref) => fetchXml(ref)))

  const urls = new Set<string>()
  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value) continue
    const sub = parseSitemapXml(result.value)
    for (const url of sub.urls) urls.add(url)
  }
  return [...urls].slice(0, MAX_URLS)
}

/**
 * Parse a sitemap XML string, extracting <loc> URLs.
 * Classifies URLs as content pages or sub-sitemap references.
 */
export function parseSitemapXml(xml: string): { urls: string[]; sitemapRefs: string[] } {
  // Strip CDATA wrappers
  const clean = xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')

  const urls: string[] = []
  const sitemapRefs: string[] = []

  const locRegex = /<loc>\s*(.*?)\s*<\/loc>/gi
  let match: RegExpExecArray | null

  while ((match = locRegex.exec(clean)) !== null) {
    const url = match[1]?.trim()
    if (!url) continue

    // Sub-sitemap references end in .xml or .xml.gz
    if (url.endsWith('.xml') || url.endsWith('.xml.gz')) {
      sitemapRefs.push(url)
    } else {
      urls.push(url)
    }
  }

  return {
    urls: urls.slice(0, MAX_URLS),
    sitemapRefs: sitemapRefs.slice(0, 20),
  }
}

/**
 * Extract Sitemap: directives from robots.txt content.
 */
export function parseSitemapFromRobotsTxt(text: string): string[] {
  const results: string[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#')) continue
    const match = trimmed.match(/^sitemap:\s*(.+)/i)
    if (match?.[1]) {
      results.push(match[1].trim())
    }
  }
  return results
}

// ---- Internal helpers ----

async function fetchXml(url: string, timeoutMs = FETCH_TIMEOUT): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT_BOT },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const text = await res.text()
    return text.slice(0, MAX_BODY_BYTES)
  } catch {
    clearTimeout(timer)
    return null
  }
}

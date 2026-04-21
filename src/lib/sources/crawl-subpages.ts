import { parseHTML } from 'linkedom'

/** Paths that are almost never individual content pages */
const EXCLUDED_PATH_RE =
  /\/(page|tag|category|author|search|login|register|cart|checkout|wp-admin|feed|rss|sitemap)\b/i

/**
 * Extract internal links from raw HTML.
 * Returns deduplicated, same-origin content URLs excluding navigation/pagination.
 */
export function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const baseOrigin = new URL(baseUrl).origin
  const { document } = parseHTML(html)
  const seen = new Set<string>()
  const links: string[] = []

  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href')
    if (
      !href ||
      href.startsWith('#') ||
      href.startsWith('?') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:')
    )
      continue

    let resolved: URL
    try {
      resolved = new URL(href, baseUrl)
    } catch {
      continue
    }

    // Same-origin only
    if (resolved.origin !== baseOrigin) continue

    // Skip excluded navigation paths
    if (EXCLUDED_PATH_RE.test(resolved.pathname)) continue

    // Strip hash and query for dedup
    resolved.hash = ''
    resolved.search = ''
    const full = resolved.href

    // Skip the source page itself
    if (full === new URL(baseUrl).href) continue

    if (!seen.has(full)) {
      seen.add(full)
      links.push(full)
    }
  }

  return links
}

/**
 * Shuffle array in place (Fisher-Yates) and return first `count` items.
 */
export function pickRandom<T>(arr: T[], count: number): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy.slice(0, count)
}

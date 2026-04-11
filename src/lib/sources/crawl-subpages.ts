/** Paths that are almost never individual content pages */
const EXCLUDED_PATH_RE =
  /\/(page|tag|category|author|search|login|register|cart|checkout|wp-admin|feed|rss|sitemap)\b/i

/**
 * Extract internal links from Jina-produced markdown.
 * Returns deduplicated, same-origin URLs excluding navigation/pagination.
 * Used as a fallback when sitemap discovery finds nothing.
 */
export function extractLinks(markdown: string, baseUrl: string): string[] {
  const baseOrigin = new URL(baseUrl).origin
  const seen = new Set<string>()
  const links: string[] = []

  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g
  let match: RegExpExecArray | null

  while ((match = linkRegex.exec(markdown)) !== null) {
    const href = match[2]!
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

    // Strip hash and query for dedup
    resolved.hash = ''
    resolved.search = ''
    const full = resolved.href

    // Skip the source page itself
    if (full === new URL(baseUrl).href) continue

    // Skip excluded navigation paths
    if (EXCLUDED_PATH_RE.test(resolved.pathname)) continue

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

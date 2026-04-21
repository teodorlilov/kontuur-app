const JINA_TIMEOUT = 15_000
const MAX_CONTENT = 8_000

/**
 * Fetches an Instagram profile page via Jina AI Reader.
 * Jina renders the page with a headless browser, bypassing Instagram's JS login wall,
 * and returns the visible text (bio, post captions, follower counts, etc.).
 *
 * Works without JINA_API_KEY (20 RPM, ~8s latency).
 * Set JINA_API_KEY for 500 RPM free tier.
 */
export async function fetchInstagramProfile(
  handle: string
): Promise<{ markdown: string; error?: string }> {
  const url = `https://www.instagram.com/${handle}/`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), JINA_TIMEOUT)

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
    if (!res.ok) return { markdown: '', error: `Jina HTTP ${res.status}` }
    const raw = (await res.text()).slice(0, MAX_CONTENT)
    if (raw.trim().length < 100) return { markdown: '', error: 'No readable content' }
    return { markdown: raw }
  } catch (err) {
    clearTimeout(timer)
    return { markdown: '', error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

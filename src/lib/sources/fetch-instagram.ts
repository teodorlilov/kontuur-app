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

// Cap the grid images we take — enough to read the brand's design DNA, bounded so a busy profile doesn't flood.
const MAX_GRID_IMAGES = 9

// Instagram post images come from the FB/Instagram CDN — the reliable host signal for the grid.
const IG_CDN = /https?:\/\/[^\s"')]+\.(?:cdninstagram\.com|fbcdn\.net)\/[^\s"')]+\.(?:jpe?g|png|webp)[^\s"')]*/gi

/**
 * Pull the Instagram grid's **post images** via Jina AI Reader (image-summary mode) — the brand's real design
 * system, used as reference images so a new client's designs match their existing look. Grid-thumbnail res.
 * Fail-soft: empty on any error → onboarding falls back to website / generated samples. (Caller stores its own
 * copies; IG CDN URLs expire.)
 */
export async function fetchInstagramImages(handle: string): Promise<{ imageUrls: string[]; error?: string }> {
  const url = `https://www.instagram.com/${handle}/`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), JINA_TIMEOUT)

  const headers: Record<string, string> = { 'X-With-Images-Summary': 'true' }
  if (process.env.JINA_API_KEY) headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`

  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { signal: controller.signal, headers })
    clearTimeout(timer)
    if (!res.ok) return { imageUrls: [], error: `Jina HTTP ${res.status}` }
    const body = await res.text()
    // Dedupe by the URL up to its query string (the same asset appears at several sizes) and skip the tiny
    // profile-avatar sizes so we keep the actual grid posts.
    const seen = new Set<string>()
    const imageUrls: string[] = []
    for (const match of body.matchAll(IG_CDN)) {
      const full = match[0]
      if (/s150x150|s320x320|profile/i.test(full)) continue
      const key = full.split('?')[0]!
      if (seen.has(key)) continue
      seen.add(key)
      imageUrls.push(full)
      if (imageUrls.length >= MAX_GRID_IMAGES) break
    }
    return { imageUrls }
  } catch (err) {
    clearTimeout(timer)
    return { imageUrls: [], error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

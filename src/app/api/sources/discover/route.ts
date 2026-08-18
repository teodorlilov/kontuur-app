import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { validateSourceUrl } from '@/lib/sources/validate-url'
import { discoverSitemapUrls } from '@/lib/sources/discover-sitemap'
import { extractLinksFromHtml } from '@/lib/sources/crawl-subpages'
import { USER_AGENT_BROWSER } from '@/utils/constants'
import { readLimitedText } from '@/lib/sources/read-limited-text'
import type { DiscoverPagesResponse } from '@/types/api'

/**
 * Shape only. Whether the URL is safe to fetch stays with `validateSourceUrl` below —
 * this route reaches out to a caller-supplied host, and a scheme/host/SSRF check is a
 * different question from "is this a string".
 */
const discoverSchema = z.object({ url: z.string().trim().min(1).max(2048) })

/** Discover a site's readable pages via its sitemap, falling back to a shallow crawl. */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const parsed = discoverSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }
  const body = parsed.data

  if (!(await validateSourceUrl(body.url))) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  // Strategy 1: Sitemap discovery (index children are merged server-side)
  const sitemapResult = await discoverSitemapUrls(body.url)

  if (sitemapResult.urls.length > 0) {
    return NextResponse.json({
      pages: sitemapResult.urls,
      source: 'sitemap',
    } satisfies DiscoverPagesResponse)
  }

  // Strategy 2: Fallback — fetch page HTML and extract links
  const fallbackController = new AbortController()
  setTimeout(() => fallbackController.abort(), 8000)
  try {
    const res = await fetch(body.url, {
      signal: fallbackController.signal,
      headers: { 'User-Agent': USER_AGENT_BROWSER },
    })
    if (res.ok) {
      const html = await readLimitedText(res, 500_000)
      const links = extractLinksFromHtml(html, body.url)
      if (links.length > 0) {
        return NextResponse.json({
          pages: links,
          source: 'link_extraction',
        } satisfies DiscoverPagesResponse)
      }
    }
  } catch {
    // fall through to 'none'
  }

  return NextResponse.json({
    pages: [],
    source: 'none',
  } satisfies DiscoverPagesResponse)
}

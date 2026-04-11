import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { validateSourceUrl } from '@/lib/sources/validate-url'
import { discoverSitemapUrls, fetchSingleSitemap } from '@/lib/sources/discover-sitemap'
import { fetchWebsiteSource } from '@/lib/sources/fetch-website'
import { extractLinks } from '@/lib/sources/crawl-subpages'
import type { DiscoverPagesRequest, DiscoverPagesResponse } from '@/types/api'

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  let body: DiscoverPagesRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.url?.trim()) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  if (!validateSourceUrl(body.url)) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  // If a specific sitemap URL is provided, fetch its pages directly
  if (body.sitemapUrl?.trim()) {
    if (!validateSourceUrl(body.sitemapUrl)) {
      return NextResponse.json({ error: 'Invalid sitemap URL' }, { status: 400 })
    }

    const pages = await fetchSingleSitemap(body.sitemapUrl)
    return NextResponse.json({
      pages,
      sitemaps: [],
      source: 'sitemap',
    } satisfies DiscoverPagesResponse)
  }

  // Strategy 1: Try sitemap discovery
  const sitemapResult = await discoverSitemapUrls(body.url)

  // If sub-sitemaps were found, return them for user selection
  if (sitemapResult.sitemapRefs.length > 0) {
    return NextResponse.json({
      pages: [],
      sitemaps: sitemapResult.sitemapRefs,
      source: 'sitemap_index',
    } satisfies DiscoverPagesResponse)
  }

  if (sitemapResult.urls.length > 0) {
    return NextResponse.json({
      pages: sitemapResult.urls,
      sitemaps: [],
      source: 'sitemap',
    } satisfies DiscoverPagesResponse)
  }

  // Strategy 2: Fallback — fetch the page via Jina and extract links
  const { markdown, error } = await fetchWebsiteSource(body.url)
  if (error || !markdown) {
    return NextResponse.json({
      pages: [],
      sitemaps: [],
      source: 'none',
    } satisfies DiscoverPagesResponse)
  }

  const links = extractLinks(markdown, body.url)
  if (links.length > 0) {
    return NextResponse.json({
      pages: links,
      sitemaps: [],
      source: 'link_extraction',
    } satisfies DiscoverPagesResponse)
  }

  return NextResponse.json({
    pages: [],
    sitemaps: [],
    source: 'none',
  } satisfies DiscoverPagesResponse)
}

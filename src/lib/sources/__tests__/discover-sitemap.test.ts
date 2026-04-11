import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseSitemapXml,
  parseSitemapFromRobotsTxt,
  discoverSitemapUrls,
  fetchSingleSitemap,
} from '../discover-sitemap'

// Mock global fetch for discoverSitemapUrls tests
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
})

describe('parseSitemapXml', () => {
  it('parses a regular sitemap with <url><loc> entries', () => {
    const xml = `<?xml version="1.0"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/page-1</loc></url>
        <url><loc>https://example.com/page-2</loc></url>
      </urlset>`
    const result = parseSitemapXml(xml)
    expect(result.urls).toEqual(['https://example.com/page-1', 'https://example.com/page-2'])
    expect(result.sitemapRefs).toEqual([])
  })

  it('parses a sitemap index with sub-sitemap references', () => {
    const xml = `<?xml version="1.0"?>
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://example.com/sitemap-posts.xml</loc></sitemap>
        <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
      </sitemapindex>`
    const result = parseSitemapXml(xml)
    expect(result.urls).toEqual([])
    expect(result.sitemapRefs).toEqual([
      'https://example.com/sitemap-posts.xml',
      'https://example.com/sitemap-pages.xml',
    ])
  })

  it('classifies .xml.gz references as sub-sitemaps', () => {
    const xml = `<urlset>
      <url><loc>https://example.com/sitemap-posts.xml.gz</loc></url>
    </urlset>`
    const result = parseSitemapXml(xml)
    expect(result.sitemapRefs).toEqual(['https://example.com/sitemap-posts.xml.gz'])
    expect(result.urls).toEqual([])
  })

  it('handles CDATA-wrapped <loc> values', () => {
    const xml = `<urlset>
      <url><loc><![CDATA[https://example.com/page-1]]></loc></url>
    </urlset>`
    const result = parseSitemapXml(xml)
    expect(result.urls).toEqual(['https://example.com/page-1'])
  })

  it('handles whitespace around URLs', () => {
    const xml = `<urlset>
      <url><loc>
        https://example.com/page-1
      </loc></url>
    </urlset>`
    const result = parseSitemapXml(xml)
    expect(result.urls).toEqual(['https://example.com/page-1'])
  })

  it('returns empty arrays for non-sitemap XML', () => {
    const xml = `<html><body>Not a sitemap</body></html>`
    const result = parseSitemapXml(xml)
    expect(result.urls).toEqual([])
    expect(result.sitemapRefs).toEqual([])
  })

  it('caps URLs at 5000', () => {
    const entries = Array.from(
      { length: 5100 },
      (_, i) => `<url><loc>https://example.com/page-${i}</loc></url>`
    ).join('')
    const xml = `<urlset>${entries}</urlset>`
    const result = parseSitemapXml(xml)
    expect(result.urls.length).toBe(5000)
  })

  it('skips empty <loc> tags', () => {
    const xml = `<urlset>
      <url><loc></loc></url>
      <url><loc>https://example.com/real</loc></url>
    </urlset>`
    const result = parseSitemapXml(xml)
    expect(result.urls).toEqual(['https://example.com/real'])
  })
})

describe('parseSitemapFromRobotsTxt', () => {
  it('extracts Sitemap: directives', () => {
    const text = `User-agent: *
Disallow: /admin/
Sitemap: https://example.com/sitemap.xml`
    expect(parseSitemapFromRobotsTxt(text)).toEqual(['https://example.com/sitemap.xml'])
  })

  it('handles multiple Sitemap directives', () => {
    const text = `Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/sitemap-news.xml`
    expect(parseSitemapFromRobotsTxt(text)).toEqual([
      'https://example.com/sitemap.xml',
      'https://example.com/sitemap-news.xml',
    ])
  })

  it('is case-insensitive', () => {
    const text = `SITEMAP: https://example.com/sitemap.xml
sitemap: https://example.com/sitemap2.xml`
    expect(parseSitemapFromRobotsTxt(text)).toEqual([
      'https://example.com/sitemap.xml',
      'https://example.com/sitemap2.xml',
    ])
  })

  it('ignores commented-out lines', () => {
    const text = `# Sitemap: https://example.com/old-sitemap.xml
Sitemap: https://example.com/sitemap.xml`
    expect(parseSitemapFromRobotsTxt(text)).toEqual(['https://example.com/sitemap.xml'])
  })

  it('handles extra whitespace', () => {
    const text = `  Sitemap:   https://example.com/sitemap.xml  `
    expect(parseSitemapFromRobotsTxt(text)).toEqual(['https://example.com/sitemap.xml'])
  })

  it('returns empty for robots.txt without Sitemap directives', () => {
    const text = `User-agent: *
Disallow: /admin/`
    expect(parseSitemapFromRobotsTxt(text)).toEqual([])
  })
})

describe('discoverSitemapUrls', () => {
  function mockResponse(body: string, ok = true) {
    return Promise.resolve({
      ok,
      text: () => Promise.resolve(body),
    })
  }

  function mock404() {
    return Promise.resolve({ ok: false, text: () => Promise.resolve('') })
  }

  it('discovers via robots.txt Sitemap directive', async () => {
    mockFetch
      .mockImplementationOnce(() => mockResponse(`Sitemap: https://example.com/sitemap.xml`))
      .mockImplementationOnce(() =>
        mockResponse(`<urlset>
        <url><loc>https://example.com/page-1</loc></url>
        <url><loc>https://example.com/page-2</loc></url>
      </urlset>`)
      )

    const result = await discoverSitemapUrls('https://example.com')
    expect(result.source).toBe('sitemap')
    expect(result.urls).toEqual(['https://example.com/page-1', 'https://example.com/page-2'])
    expect(result.sitemapRefs).toEqual([])
  })

  it('falls back to /sitemap.xml when robots.txt has no directives', async () => {
    mockFetch
      .mockImplementationOnce(() => mockResponse(`User-agent: *\nDisallow: /admin/`))
      .mockImplementationOnce(() =>
        mockResponse(`<urlset>
        <url><loc>https://example.com/page-1</loc></url>
      </urlset>`)
      )

    const result = await discoverSitemapUrls('https://example.com')
    expect(result.source).toBe('sitemap')
    expect(result.urls).toEqual(['https://example.com/page-1'])
    // Should have fetched robots.txt then /sitemap.xml
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('falls back to /wp-sitemap.xml when /sitemap.xml 404s', async () => {
    mockFetch
      .mockImplementationOnce(() => mock404()) // robots.txt
      .mockImplementationOnce(() => mock404()) // /sitemap.xml
      .mockImplementationOnce(() =>
        mockResponse(`<urlset>
        <url><loc>https://example.com/property/a</loc></url>
      </urlset>`)
      ) // /wp-sitemap.xml

    const result = await discoverSitemapUrls('https://example.com')
    expect(result.source).toBe('sitemap')
    expect(result.urls).toEqual(['https://example.com/property/a'])
  })

  it('returns sub-sitemap refs instead of auto-following them', async () => {
    mockFetch
      .mockImplementationOnce(() => mock404()) // robots.txt
      .mockImplementationOnce(() =>
        mockResponse(`<sitemapindex>
        <sitemap><loc>https://example.com/sitemap-posts.xml</loc></sitemap>
        <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
      </sitemapindex>`)
      ) // /sitemap.xml (index)

    const result = await discoverSitemapUrls('https://example.com')
    expect(result.source).toBe('sitemap')
    expect(result.urls).toEqual([])
    expect(result.sitemapRefs).toEqual([
      'https://example.com/sitemap-posts.xml',
      'https://example.com/sitemap-pages.xml',
    ])
    // Should NOT have followed sub-sitemaps — only robots.txt + sitemap.xml
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('returns none when no sitemap found anywhere', async () => {
    mockFetch.mockImplementation(() => mock404())

    const result = await discoverSitemapUrls('https://example.com')
    expect(result.source).toBe('none')
    expect(result.urls).toEqual([])
    expect(result.sitemapRefs).toEqual([])
    // robots.txt + 3 fallback paths
    expect(mockFetch).toHaveBeenCalledTimes(4)
  })

  it('handles fetch errors gracefully', async () => {
    mockFetch.mockImplementation(() => Promise.reject(new Error('Network error')))

    const result = await discoverSitemapUrls('https://example.com')
    expect(result.source).toBe('none')
    expect(result.urls).toEqual([])
    expect(result.sitemapRefs).toEqual([])
  })

  it('handles invalid siteUrl gracefully', async () => {
    const result = await discoverSitemapUrls('not-a-url')
    expect(result.source).toBe('none')
    expect(result.urls).toEqual([])
    expect(result.sitemapRefs).toEqual([])
  })

  it('processes all sitemaps from robots.txt (not just first)', async () => {
    mockFetch
      .mockImplementationOnce(() =>
        mockResponse(
          `Sitemap: https://example.com/sitemap1.xml\nSitemap: https://example.com/sitemap2.xml`
        )
      )
      .mockImplementationOnce(() =>
        mockResponse(`<urlset>
        <url><loc>https://example.com/a</loc></url>
      </urlset>`)
      )
      .mockImplementationOnce(() =>
        mockResponse(`<urlset>
        <url><loc>https://example.com/b</loc></url>
      </urlset>`)
      )

    const result = await discoverSitemapUrls('https://example.com')
    expect(result.urls).toContain('https://example.com/a')
    expect(result.urls).toContain('https://example.com/b')
  })

  it('collects sub-sitemap refs across multiple robots.txt sitemaps', async () => {
    mockFetch
      .mockImplementationOnce(() =>
        mockResponse(
          `Sitemap: https://example.com/sitemap1.xml\nSitemap: https://example.com/sitemap2.xml`
        )
      )
      .mockImplementationOnce(() =>
        mockResponse(`<sitemapindex>
        <sitemap><loc>https://example.com/posts.xml</loc></sitemap>
      </sitemapindex>`)
      )
      .mockImplementationOnce(() =>
        mockResponse(`<sitemapindex>
        <sitemap><loc>https://example.com/pages.xml</loc></sitemap>
      </sitemapindex>`)
      )

    const result = await discoverSitemapUrls('https://example.com')
    expect(result.sitemapRefs).toContain('https://example.com/posts.xml')
    expect(result.sitemapRefs).toContain('https://example.com/pages.xml')
    expect(result.urls).toEqual([])
  })
})

describe('fetchSingleSitemap', () => {
  function mockResponse(body: string, ok = true) {
    return Promise.resolve({
      ok,
      text: () => Promise.resolve(body),
    })
  }

  function mock404() {
    return Promise.resolve({ ok: false, text: () => Promise.resolve('') })
  }

  it('returns content URLs from a flat sitemap', async () => {
    mockFetch.mockImplementationOnce(() =>
      mockResponse(`<urlset>
      <url><loc>https://example.com/post/1</loc></url>
      <url><loc>https://example.com/post/2</loc></url>
    </urlset>`)
    )

    const urls = await fetchSingleSitemap('https://example.com/post-sitemap.xml')
    expect(urls).toEqual(['https://example.com/post/1', 'https://example.com/post/2'])
  })

  it('follows sub-refs one level deep', async () => {
    mockFetch
      .mockImplementationOnce(() =>
        mockResponse(`<sitemapindex>
        <sitemap><loc>https://example.com/sub1.xml</loc></sitemap>
        <sitemap><loc>https://example.com/sub2.xml</loc></sitemap>
      </sitemapindex>`)
      )
      .mockImplementationOnce(() =>
        mockResponse(`<urlset>
        <url><loc>https://example.com/a</loc></url>
      </urlset>`)
      )
      .mockImplementationOnce(() =>
        mockResponse(`<urlset>
        <url><loc>https://example.com/b</loc></url>
      </urlset>`)
      )

    const urls = await fetchSingleSitemap('https://example.com/sitemap.xml')
    expect(urls).toContain('https://example.com/a')
    expect(urls).toContain('https://example.com/b')
  })

  it('returns empty array when sitemap is unreachable', async () => {
    mockFetch.mockImplementationOnce(() => mock404())

    const urls = await fetchSingleSitemap('https://example.com/missing.xml')
    expect(urls).toEqual([])
  })

  it('returns empty array on fetch error', async () => {
    mockFetch.mockImplementationOnce(() => Promise.reject(new Error('Network error')))

    const urls = await fetchSingleSitemap('https://example.com/broken.xml')
    expect(urls).toEqual([])
  })

  it('deduplicates URLs from sub-sitemaps', async () => {
    mockFetch
      .mockImplementationOnce(() =>
        mockResponse(`<sitemapindex>
        <sitemap><loc>https://example.com/s1.xml</loc></sitemap>
        <sitemap><loc>https://example.com/s2.xml</loc></sitemap>
      </sitemapindex>`)
      )
      .mockImplementationOnce(() =>
        mockResponse(`<urlset>
        <url><loc>https://example.com/shared</loc></url>
        <url><loc>https://example.com/unique-1</loc></url>
      </urlset>`)
      )
      .mockImplementationOnce(() =>
        mockResponse(`<urlset>
        <url><loc>https://example.com/shared</loc></url>
        <url><loc>https://example.com/unique-2</loc></url>
      </urlset>`)
      )

    const urls = await fetchSingleSitemap('https://example.com/sitemap.xml')
    expect(urls).toHaveLength(3)
    expect(urls).toContain('https://example.com/shared')
    expect(urls).toContain('https://example.com/unique-1')
    expect(urls).toContain('https://example.com/unique-2')
  })
})

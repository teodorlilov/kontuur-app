import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchRssSource, isValidRssUrl } from '../fetch-rss'

function mockFetchResponse(
  body: string,
  opts: { ok?: boolean; status?: number; contentType?: string } = {}
) {
  const { ok = true, status = 200, contentType = 'application/rss+xml' } = opts
  return vi.fn().mockResolvedValue({
    ok,
    status,
    headers: { get: (key: string) => (key === 'content-type' ? contentType : null) },
    text: () => Promise.resolve(body),
  })
}

const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Article 1</title>
      <description>Description 1</description>
      <link>https://example.com/1</link>
      <pubDate>Mon, 22 Mar 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Article 2</title>
      <description>Description 2</description>
      <link>https://example.com/2</link>
      <pubDate>Sun, 21 Mar 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Article 3</title>
      <description>Description 3</description>
      <link>https://example.com/3</link>
    </item>
    <item>
      <title>Article 4</title>
      <description>Description 4</description>
      <link>https://example.com/4</link>
    </item>
    <item>
      <title>Article 5</title>
      <description>Description 5</description>
      <link>https://example.com/5</link>
    </item>
  </channel>
</rss>`

const CDATA_FEED = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title><![CDATA[CDATA Title]]></title>
      <description><![CDATA[CDATA Description]]></description>
      <link>https://example.com/cdata</link>
    </item>
  </channel>
</rss>`

const HTML_DESC_FEED = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>HTML Test</title>
      <description><p>This is <strong>bold</strong> and <em>italic</em> text</p></description>
      <link>https://example.com/html</link>
    </item>
  </channel>
</rss>`

const EMPTY_FEED = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Empty</title></channel></rss>`

const NO_TITLE_FEED = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <link>https://example.com/no-title</link>
    </item>
  </channel>
</rss>`

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetchResponse(RSS_FEED))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchRssSource', () => {
  it('parses a valid RSS 2.0 feed and returns default 4 items', async () => {
    const result = await fetchRssSource('https://example.com/feed')
    expect(result.error).toBeUndefined()
    expect(result.items).toHaveLength(4)
    expect(result.items[0]!.title).toBe('Article 1')
    expect(result.items[0]!.description).toBe('Description 1')
    expect(result.items[0]!.link).toBe('https://example.com/1')
    expect(result.items[0]!.pubDate).toBe('Mon, 22 Mar 2026 10:00:00 GMT')
  })

  it('respects maxItems parameter', async () => {
    const result = await fetchRssSource('https://example.com/feed', 2)
    expect(result.items).toHaveLength(2)
  })

  it('returns all items when maxItems exceeds available', async () => {
    const result = await fetchRssSource('https://example.com/feed', 10)
    expect(result.items).toHaveLength(5)
  })

  it('strips CDATA wrappers', async () => {
    vi.stubGlobal('fetch', mockFetchResponse(CDATA_FEED))
    const result = await fetchRssSource('https://example.com/cdata-feed')
    expect(result.items[0]!.title).toBe('CDATA Title')
    expect(result.items[0]!.description).toBe('CDATA Description')
  })

  it('strips HTML tags from descriptions', async () => {
    vi.stubGlobal('fetch', mockFetchResponse(HTML_DESC_FEED))
    const result = await fetchRssSource('https://example.com/html-feed')
    expect(result.items[0]!.description).not.toContain('<p>')
    expect(result.items[0]!.description).not.toContain('<strong>')
    expect(result.items[0]!.description).toContain('bold')
    expect(result.items[0]!.description).toContain('italic')
  })

  it('truncates long descriptions to 300 chars', async () => {
    const longDesc = 'A'.repeat(500)
    const feed = `<?xml version="1.0"?><rss><channel><item><title>Long</title><description>${longDesc}</description><link>https://x.com</link></item></channel></rss>`
    vi.stubGlobal('fetch', mockFetchResponse(feed))
    const result = await fetchRssSource('https://example.com/long')
    expect(result.items[0]!.description.length).toBeLessThanOrEqual(300)
  })

  it('returns empty items for empty feed', async () => {
    vi.stubGlobal('fetch', mockFetchResponse(EMPTY_FEED))
    const result = await fetchRssSource('https://example.com/empty')
    expect(result.items).toHaveLength(0)
    expect(result.error).toBeUndefined()
  })

  it('filters out items without title or description', async () => {
    vi.stubGlobal('fetch', mockFetchResponse(NO_TITLE_FEED))
    const result = await fetchRssSource('https://example.com/no-title')
    expect(result.items).toHaveLength(0)
  })

  it('returns error on HTTP failure', async () => {
    vi.stubGlobal('fetch', mockFetchResponse('', { ok: false, status: 404 }))
    const result = await fetchRssSource('https://example.com/404')
    expect(result.items).toHaveLength(0)
    expect(result.error).toBe('HTTP 404')
  })

  it('returns error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const result = await fetchRssSource('https://example.com/fail')
    expect(result.items).toHaveLength(0)
    expect(result.error).toBe('Network error')
  })

  it('sets pubDate to null when missing', async () => {
    const result = await fetchRssSource('https://example.com/feed')
    // Item 3 has no pubDate
    expect(result.items[2]!.pubDate).toBeNull()
  })

  it('sends PostflowBot User-Agent header', async () => {
    await fetchRssSource('https://example.com/feed')
    const fetchCall = vi.mocked(fetch).mock.calls[0]!
    const options = fetchCall[1] as RequestInit
    expect((options.headers as Record<string, string>)['User-Agent']).toBe('PostflowBot/1.0')
  })
})

describe('isValidRssUrl', () => {
  it('returns true for application/rss+xml content type', async () => {
    vi.stubGlobal('fetch', mockFetchResponse('<rss></rss>', { contentType: 'application/rss+xml' }))
    expect(await isValidRssUrl('https://example.com/rss')).toBe(true)
  })

  it('returns true for application/atom+xml content type', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchResponse('<feed></feed>', { contentType: 'application/atom+xml' })
    )
    expect(await isValidRssUrl('https://example.com/atom')).toBe(true)
  })

  it('returns true for text/xml with <rss in body', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchResponse('<rss version="2.0"></rss>', { contentType: 'text/html' })
    )
    expect(await isValidRssUrl('https://example.com/rss')).toBe(true)
  })

  it('returns true for text/xml with <feed in body', async () => {
    vi.stubGlobal('fetch', mockFetchResponse('<feed xmlns="...">', { contentType: 'text/html' }))
    expect(await isValidRssUrl('https://example.com/atom')).toBe(true)
  })

  it('returns true for <?xml in body', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchResponse('<?xml version="1.0"?><rss></rss>', { contentType: 'text/plain' })
    )
    expect(await isValidRssUrl('https://example.com/xml')).toBe(true)
  })

  it('returns false for HTML with no XML markers', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchResponse('<html><body>Hello</body></html>', { contentType: 'text/html' })
    )
    expect(await isValidRssUrl('https://example.com/html')).toBe(false)
  })

  it('returns false on HTTP error', async () => {
    vi.stubGlobal('fetch', mockFetchResponse('', { ok: false, status: 500 }))
    expect(await isValidRssUrl('https://example.com/error')).toBe(false)
  })

  it('returns false on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    expect(await isValidRssUrl('https://example.com/timeout')).toBe(false)
  })
})

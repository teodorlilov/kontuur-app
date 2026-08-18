import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCallAnthropic = vi.fn()
const mockParseJsonResponse = vi.fn()
const mockDiscoverFeedUrl = vi.fn()
const mockValidateSourceUrl = vi.fn()

vi.mock('@/utils/ai-client', () => ({
  callAnthropic: (...args: unknown[]) => mockCallAnthropic(...args),
  LIGHT_MODEL: 'claude-haiku-4-5',
}))
vi.mock('@/utils/ai', () => ({
  parseJsonResponse: (...args: unknown[]) => mockParseJsonResponse(...args),
}))
vi.mock('@/lib/sources/discover-feed-url', () => ({
  discoverFeedUrl: (...args: unknown[]) => mockDiscoverFeedUrl(...args),
}))
vi.mock('@/lib/sources/validate-url', () => ({
  validateSourceUrl: (...args: unknown[]) => mockValidateSourceUrl(...args),
}))

import { suggestSources } from '../suggest-sources'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function tavilyResult(domain: string, score: number) {
  return {
    title: `${domain} title`,
    url: `https://${domain}/article`,
    content: `Content from ${domain}`,
    score,
  }
}

function tavilyResponse(results: ReturnType<typeof tavilyResult>[]) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ results }),
  })
}

beforeEach(() => {
  mockCallAnthropic.mockReset()
  mockParseJsonResponse.mockReset()
  mockDiscoverFeedUrl.mockReset()
  mockValidateSourceUrl.mockReset()
  mockFetch.mockReset()
  process.env.TAVILY_API_URL_KEY = 'test-key'

  // Defaults: query gen returns 2 queries; re-rank keeps everything as-is
  mockCallAnthropic.mockResolvedValue({})
  mockParseJsonResponse.mockReturnValue(['health blog', 'health news'])
  mockValidateSourceUrl.mockResolvedValue(true)
  mockDiscoverFeedUrl.mockImplementation((url: string) =>
    Promise.resolve(`${new URL(url).origin}/feed`)
  )
})

describe('suggestSources', () => {
  it('returns feeds for domains discovered via Tavily', async () => {
    mockFetch.mockImplementation(() =>
      tavilyResponse([tavilyResult('site-a.com', 0.9), tavilyResult('site-b.com', 0.8)])
    )
    // Re-rank pass-through: parse fails → unranked order
    mockParseJsonResponse.mockReturnValueOnce(['q1', 'q2']).mockReturnValue([])

    const results = await suggestSources({ niche: 'health' })
    expect(results.map((r) => r.url)).toEqual([
      'https://site-a.com/feed',
      'https://site-b.com/feed',
    ])
  })

  it('drops results below the Tavily score threshold', async () => {
    mockFetch.mockImplementation(() =>
      tavilyResponse([tavilyResult('good.com', 0.5), tavilyResult('weak.com', 0.1)])
    )
    mockParseJsonResponse.mockReturnValueOnce(['q1']).mockReturnValue([])

    const results = await suggestSources({ niche: 'health' })
    expect(results.map((r) => r.url)).toEqual(['https://good.com/feed'])
  })

  it('drops sites without a discoverable feed', async () => {
    mockFetch.mockImplementation(() =>
      tavilyResponse([tavilyResult('hasfeed.com', 0.9), tavilyResult('nofeed.com', 0.8)])
    )
    mockDiscoverFeedUrl.mockImplementation((url: string) =>
      url.includes('nofeed')
        ? Promise.resolve(null)
        : Promise.resolve(`${new URL(url).origin}/feed`)
    )
    mockParseJsonResponse.mockReturnValueOnce(['q1']).mockReturnValue([])

    const results = await suggestSources({ niche: 'health' })
    expect(results.map((r) => r.url)).toEqual(['https://hasfeed.com/feed'])
  })

  it('drops sites that fail the SSRF URL check', async () => {
    mockFetch.mockImplementation(() =>
      tavilyResponse([tavilyResult('public.com', 0.9), tavilyResult('internal.local', 0.8)])
    )
    mockValidateSourceUrl.mockImplementation((url: string) =>
      Promise.resolve(!url.includes('internal'))
    )
    mockParseJsonResponse.mockReturnValueOnce(['q1']).mockReturnValue([])

    const results = await suggestSources({ niche: 'health' })
    expect(results.map((r) => r.url)).toEqual(['https://public.com/feed'])
  })

  it('caps suggestions at 8 even when more feeds are found', async () => {
    const many = Array.from({ length: 12 }, (_, i) => tavilyResult(`site-${i}.com`, 0.9 - i * 0.01))
    mockFetch.mockImplementation(() => tavilyResponse(many))
    mockParseJsonResponse.mockReturnValueOnce(['q1']).mockReturnValue([])

    const results = await suggestSources({ niche: 'health' })
    expect(results).toHaveLength(8)
  })

  it('applies the re-rank order, keep flags, and rewritten reasons', async () => {
    mockFetch.mockImplementation(() =>
      tavilyResponse([
        tavilyResult('first.com', 0.9),
        tavilyResult('second.com', 0.8),
        tavilyResult('third.com', 0.7),
      ])
    )
    mockParseJsonResponse
      .mockReturnValueOnce(['q1']) // query gen
      .mockReturnValueOnce([
        { index: 3, keep: true, reason: 'Best match for the clinic.' },
        { index: 1, keep: true, reason: 'Solid industry news.' },
        { index: 2, keep: false },
      ])

    const results = await suggestSources({ niche: 'health' })
    expect(results.map((r) => r.url)).toEqual(['https://third.com/feed', 'https://first.com/feed'])
    expect(results[0]!.reason).toBe('Best match for the clinic.')
  })

  it('falls back to unranked order when the re-rank call throws', async () => {
    mockFetch.mockImplementation(() =>
      tavilyResponse([tavilyResult('a.com', 0.9), tavilyResult('b.com', 0.8)])
    )
    mockParseJsonResponse.mockReturnValueOnce(['q1'])
    // Query-gen call resolves; re-rank call rejects
    mockCallAnthropic.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('model down'))

    const results = await suggestSources({ niche: 'health' })
    expect(results.map((r) => r.url)).toEqual(['https://a.com/feed', 'https://b.com/feed'])
  })

  it('uses fallback queries when query generation fails', async () => {
    mockCallAnthropic.mockRejectedValueOnce(new Error('model down')).mockResolvedValue({})
    mockParseJsonResponse.mockReturnValue([])
    mockFetch.mockImplementation(() => tavilyResponse([tavilyResult('a.com', 0.9)]))

    const results = await suggestSources({ niche: 'health' })
    // 2 fallback query searches ran against Tavily
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(results.map((r) => r.url)).toEqual(['https://a.com/feed'])
  })

  it('returns empty when Tavily key is missing', async () => {
    delete process.env.TAVILY_API_URL_KEY
    mockParseJsonResponse.mockReturnValueOnce(['q1']).mockReturnValue([])

    const results = await suggestSources({ niche: 'health' })
    expect(results).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('deduplicates candidates that resolve to the same feed URL', async () => {
    mockFetch.mockImplementation(() =>
      tavilyResponse([tavilyResult('same.com', 0.9), tavilyResult('www2.same.net', 0.8)])
    )
    mockDiscoverFeedUrl.mockResolvedValue('https://same.com/feed')
    mockParseJsonResponse.mockReturnValueOnce(['q1']).mockReturnValue([])

    const results = await suggestSources({ niche: 'health' })
    expect(results).toHaveLength(1)
  })
})

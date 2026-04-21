import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWebsiteSource } from '../fetch-website'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
})

function mockFetch(body: string, opts: { ok?: boolean; status?: number } = {}) {
  const { ok = true, status = 200 } = opts
  vi.mocked(fetch).mockResolvedValue({
    ok,
    status,
    text: () => Promise.resolve(body),
  } as Response)
}

const ARTICLE_HTML = `<html><head><title>Test</title></head><body>
  <nav>Nav link 1</nav>
  <article>
    <h1>Article Title</h1>
    <p>This is the main article content that readability should extract from the page.</p>
    <p>It contains useful information about the topic at hand, providing readers with clear and actionable insights.</p>
    <p>The article goes into further depth explaining the subject matter in a way that is easy to understand and apply in practice.</p>
  </article>
  <footer>Footer content</footer>
</body></html>`

describe('fetchWebsiteSource', () => {
  it('returns extracted article text from HTML', async () => {
    mockFetch(ARTICLE_HTML)
    const result = await fetchWebsiteSource('https://example.com')
    expect(result.error).toBeUndefined()
    expect(result.markdown).toContain('article content')
  })

  it('strips navigation and footer from output', async () => {
    mockFetch(ARTICLE_HTML)
    const result = await fetchWebsiteSource('https://example.com')
    // Readability's textContent strips nav/footer
    expect(result.markdown).not.toContain('Nav link 1')
    expect(result.markdown).not.toContain('Footer content')
  })

  it('truncates response to 8000 chars', async () => {
    const longContent = `<html><body><article><p>${'A'.repeat(10000)}</p></article></body></html>`
    mockFetch(longContent)
    const result = await fetchWebsiteSource('https://example.com')
    expect(result.markdown.length).toBeLessThanOrEqual(8000)
  })

  it('returns error on HTTP failure', async () => {
    mockFetch('', { ok: false, status: 500 })
    const result = await fetchWebsiteSource('https://example.com')
    expect(result.markdown).toBe('')
    expect(result.error).toBe('HTTP 500')
  })

  it('returns error on network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Connection refused'))
    const result = await fetchWebsiteSource('https://example.com')
    expect(result.markdown).toBe('')
    expect(result.error).toBe('Connection refused')
  })

  it('returns error when HTML has no readable content', async () => {
    mockFetch('<html><body></body></html>')
    const result = await fetchWebsiteSource('https://example.com')
    expect(result.markdown).toBe('')
    expect(result.error).toBeTruthy()
  })

  it('fetches the URL directly without proxying', async () => {
    mockFetch(ARTICLE_HTML)
    await fetchWebsiteSource('https://example.com/page')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://example.com/page',
      expect.any(Object)
    )
    // Must NOT route through r.jina.ai
    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(calledUrl).not.toContain('jina.ai')
  })
})

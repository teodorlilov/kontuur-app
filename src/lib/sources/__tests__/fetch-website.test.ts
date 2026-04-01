import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWebsiteSource } from '../fetch-website'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  // Clear env before each test
  delete process.env.JINA_API_KEY
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

describe('fetchWebsiteSource', () => {
  it('returns markdown from successful fetch', async () => {
    mockFetch('# Hello World\n\nSome content here.')
    const result = await fetchWebsiteSource('https://example.com')
    expect(result.markdown).toBe('# Hello World\n\nSome content here.')
    expect(result.error).toBeUndefined()
  })

  it('truncates response to 8000 chars', async () => {
    const longContent = 'A'.repeat(10000)
    mockFetch(longContent)
    const result = await fetchWebsiteSource('https://example.com')
    expect(result.markdown.length).toBe(8000)
  })

  it('constructs correct Jina Reader URL', async () => {
    mockFetch('content')
    await fetchWebsiteSource('https://example.com/page')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://r.jina.ai/https://example.com/page',
      expect.any(Object)
    )
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

  it('does not send Authorization header when JINA_API_KEY is not set', async () => {
    mockFetch('content')
    await fetchWebsiteSource('https://example.com')
    const callArgs = vi.mocked(fetch).mock.calls[0]!
    const options = callArgs[1] as RequestInit
    const headers = options.headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })

  it('sends Authorization header when JINA_API_KEY is set', async () => {
    process.env.JINA_API_KEY = 'test-key-123'
    mockFetch('content')
    await fetchWebsiteSource('https://example.com')
    const callArgs = vi.mocked(fetch).mock.calls[0]!
    const options = callArgs[1] as RequestInit
    const headers = options.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer test-key-123')
  })

  it('sends Accept: text/plain header', async () => {
    mockFetch('content')
    await fetchWebsiteSource('https://example.com')
    const callArgs = vi.mocked(fetch).mock.calls[0]!
    const options = callArgs[1] as RequestInit
    const headers = options.headers as Record<string, string>
    expect(headers['Accept']).toBe('text/plain')
  })
})

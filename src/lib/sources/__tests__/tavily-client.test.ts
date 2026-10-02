import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/billing/spend-context', () => ({
  requireSpender: () => ({ agencyId: 'agency-1', flow: 'sources' }),
}))
vi.mock('@/lib/billing/telemetry', () => ({ recordAiUsage: vi.fn() }))

import { queryTavily } from '../tavily-client'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const GOOD = { title: 'A', url: 'https://a.example/post', content: 'Snippet', score: 0.8 }

function answer(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  })
}

describe('queryTavily — the answer is parsed, not trusted', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    process.env.TAVILY_API_URL_KEY = 'test-key'
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('drops a hit with null content and one with no score, rather than hand them on as real, with one warning naming how many', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const unscored = { title: GOOD.title, url: GOOD.url, content: GOOD.content }
    mockFetch.mockImplementation(() =>
      answer({ results: [GOOD, { ...GOOD, content: null }, unscored] })
    )

    await expect(queryTavily('q', { maxResults: 5 })).resolves.toEqual([GOOD])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('dropped 2 of 3')
  })

  it('answers [] and logs the status on a non-OK answer', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockFetch.mockImplementation(() =>
      answer({ detail: 'Unauthorized' }, { ok: false, status: 401 })
    )

    await expect(queryTavily('q', { maxResults: 5 })).resolves.toEqual([])
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0]?.[0]).toMatch(/\[tavily\].*401/)
  })

  it('answers [] and logs when the answer is not the expected shape', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockFetch.mockImplementation(() => answer({ results: 'not a list' }))

    await expect(queryTavily('q', { maxResults: 5 })).resolves.toEqual([])
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0]?.[0]).toContain('[tavily]')
  })
})

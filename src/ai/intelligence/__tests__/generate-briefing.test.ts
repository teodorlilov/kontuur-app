import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/ai-client')

import { anthropic } from '@/utils/__mocks__/ai-client'
import { generateBriefing } from '../generate-briefing'

const WINDOW = { since: '2026-08-31', until: '2026-09-07' }

/** A search result block as the API returns it on success. */
function searched(...urls: string[]) {
  return {
    type: 'web_search_tool_result',
    tool_use_id: 'srvtoolu_1',
    content: urls.map((url) => ({
      type: 'web_search_result',
      url,
      title: url,
      encrypted_content: '',
      page_age: null,
    })),
  }
}

/** The model's answer as the text block that follows the searches. */
function answer(items: unknown[]) {
  return { type: 'text', text: JSON.stringify(items), citations: null }
}

function respondWith(...content: unknown[]) {
  anthropic.messages.create.mockResolvedValue({ content })
}

const GRID = {
  network: 'instagram',
  title: 'Feed grid moves to 3:4 for every account',
  source_url: 'https://about.instagram.com/blog/announcements/grid',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('generateBriefing', () => {
  it('keeps an item whose source is a page the search returned', async () => {
    respondWith(searched(GRID.source_url), answer([GRID]))

    const run = await generateBriefing(WINDOW)

    expect(run).toEqual({ items: [GRID], unverified: 0 })
  })

  it('drops an item whose source the search never returned, and counts it', async () => {
    respondWith(
      searched('https://about.instagram.com/blog/other'),
      answer([GRID, { ...GRID, title: 'Second', source_url: 'https://about.fb.com/news/made-up' }])
    )

    const run = await generateBriefing(WINDOW)

    expect(run.items).toEqual([])
    expect(run.unverified).toBe(2)
  })

  it('matches a source across a trailing slash, a query string and a fragment', async () => {
    respondWith(
      searched('https://About.Instagram.com/blog/announcements/grid/?utm_source=x#top'),
      answer([GRID])
    )

    const run = await generateBriefing(WINDOW)

    expect(run.items).toEqual([GRID])
  })

  it('treats a failed search — an error object where the results list would be — as no pages', async () => {
    respondWith(
      {
        type: 'web_search_tool_result',
        tool_use_id: 'srvtoolu_1',
        content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' },
      },
      answer([GRID])
    )

    const run = await generateBriefing(WINDOW)

    expect(run).toEqual({ items: [], unverified: 1 })
  })

  it('strips citation tags before parsing, even inside a JSON string', async () => {
    const cited = `[{"network":"instagram","title":"Feed grid <cite index="1-2">moves to 3:4</cite> for every account","source_url":"${GRID.source_url}"}]`
    respondWith(searched(GRID.source_url), { type: 'text', text: cited, citations: null })

    const run = await generateBriefing(WINDOW)

    expect(run.items[0]?.title).toBe(GRID.title)
  })

  it('caps the brief at five items', async () => {
    const urls = Array.from({ length: 7 }, (_, i) => `https://about.fb.com/news/change-${i}`)
    respondWith(
      searched(...urls),
      answer(urls.map((url, i) => ({ network: 'facebook', title: `Change ${i}`, source_url: url })))
    )

    const run = await generateBriefing(WINDOW)

    expect(run.items).toHaveLength(5)
    expect(run.unverified).toBe(0)
  })

  it('returns an empty brief when the model answers []', async () => {
    respondWith(searched('https://about.fb.com/news/quiet'), answer([]))

    const run = await generateBriefing(WINDOW)

    expect(run).toEqual({ items: [], unverified: 0 })
  })

  it('skips a malformed element and keeps the rest', async () => {
    respondWith(
      searched(GRID.source_url),
      answer([
        { network: 'tiktok', title: 'Not a network we publish to', source_url: GRID.source_url },
        GRID,
      ])
    )

    const run = await generateBriefing(WINDOW)

    expect(run).toEqual({ items: [GRID], unverified: 0 })
  })

  it('throws when the response holds no JSON array rather than reading it as a quiet week', async () => {
    respondWith(searched(GRID.source_url), {
      type: 'text',
      text: 'Nothing I could find.',
      citations: null,
    })

    await expect(generateBriefing(WINDOW)).rejects.toThrow(/no JSON array/)
  })

  it('lets an API failure propagate', async () => {
    anthropic.messages.create.mockRejectedValue(new Error('overloaded'))

    await expect(generateBriefing(WINDOW)).rejects.toThrow('overloaded')
  })

  it('searches only the allowlisted domains, at most eight times', async () => {
    respondWith(answer([]))

    await generateBriefing(WINDOW)

    const params = anthropic.messages.create.mock.calls[0]?.[0] as {
      tools: Array<{ type: string; max_uses: number; allowed_domains: string[] }>
    }
    expect(params.tools[0]?.type).toBe('web_search_20260209')
    expect(params.tools[0]?.max_uses).toBe(8)
    expect(params.tools[0]?.allowed_domains).toContain('about.instagram.com')
  })
})

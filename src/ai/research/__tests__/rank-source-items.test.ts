import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/ai-client')

import { callAnthropic } from '@/utils/__mocks__/ai-client'
import { rankSourceItems, computeSourceBoost, RANK_MIN_ITEMS, RANKED_RSS_CAP } from '../rank-source-items'
import type { SourceContext } from '../types'
import type { RssItem } from '@/lib/sources/fetch-rss'
import type { TrendSearchResult } from '@/lib/sources/fetch-trend-search'

beforeEach(() => {
  vi.clearAllMocks()
})

const OPTS = {
  niche: 'physiotherapy',
  targetAudience: 'active adults',
  contentPillars: [
    { id: 'p1', pillar: 'Educational', weight: 60 },
    { id: 'p2', pillar: 'Services', weight: 40 },
  ],
}

function rssItem(n: number): RssItem {
  return { title: `rss ${n}`, description: `desc ${n}`, link: `https://a.com/${n}`, pubDate: null }
}

function webItem(n: number): TrendSearchResult {
  return { title: `web ${n}`, snippet: `snip ${n}`, url: `https://w.com/${n}`, score: 0.5 }
}

function makeContext(rssCount: number, webCount: number): SourceContext {
  return {
    rssItems: Array.from({ length: rssCount }, (_, i) => rssItem(i + 1)),
    websiteExcerpts: [{ url: 'https://site.com', text: 'site text' }],
    fileExcerpts: [],
    ...(webCount > 0
      ? { webSearchItems: Array.from({ length: webCount }, (_, i) => webItem(i + 1)) }
      : {}),
  }
}

function mockRankings(rankings: Array<{ index: number; score: number; bestPillar?: string | null }>) {
  callAnthropic.mockResolvedValue({
    content: [
      {
        type: 'tool_use',
        id: 'mock',
        name: 'output',
        input: {
          rankings: rankings.map((r) => ({ bestPillar: null, ...r })),
        },
      },
    ],
  })
}

describe('rankSourceItems', () => {
  it('skips the call entirely below RANK_MIN_ITEMS', async () => {
    const context = makeContext(3, 2) // 5 < 8
    const result = await rankSourceItems(context, OPTS)
    expect(result).toBe(context)
    expect(callAnthropic).not.toHaveBeenCalled()
  })

  it('keeps only items at or above the score threshold, preserving object identity', async () => {
    const context = makeContext(8, 0)
    mockRankings([
      { index: 1, score: 9 },
      { index: 2, score: 3 }, // dropped
      { index: 3, score: 5 },
      { index: 4, score: 0 }, // dropped
      { index: 5, score: 4 },
      { index: 6, score: 2 }, // dropped
      { index: 7, score: 8 },
      { index: 8, score: 1 }, // dropped
    ])

    const result = await rankSourceItems(context, OPTS)
    expect(result.rssItems).toHaveLength(4)
    // Identity preserved — the same objects, not copies
    expect(result.rssItems).toContain(context.rssItems[0])
    expect(result.rssItems).toContain(context.rssItems[6])
    // Website excerpts never ranked
    expect(result.websiteExcerpts).toBe(context.websiteExcerpts)
  })

  it('applies the correct index offset for web items', async () => {
    const context = makeContext(5, 4)
    mockRankings([
      { index: 1, score: 0 },
      { index: 2, score: 0 },
      { index: 3, score: 0 },
      { index: 4, score: 0 },
      { index: 5, score: 0 },
      { index: 6, score: 9 }, // web item 1
      { index: 7, score: 0 },
      { index: 8, score: 0 },
      { index: 9, score: 8 }, // web item 4
    ])

    const result = await rankSourceItems(context, OPTS)
    expect(result.rssItems).toHaveLength(0)
    expect(result.webSearchItems).toHaveLength(2)
    expect(result.webSearchItems).toContain(context.webSearchItems![0])
    expect(result.webSearchItems).toContain(context.webSearchItems![3])
  })

  it('caps items per pillar', async () => {
    const context = makeContext(8, 0)
    // All 8 items land on the same pillar with passing scores; the per-pillar
    // cap (4) must keep the survivor count at or below it.
    mockRankings(
      Array.from({ length: 8 }, (_, i) => ({
        index: i + 1,
        score: 9 - (i % 3),
        bestPillar: 'Educational',
      }))
    )

    const result = await rankSourceItems(context, OPTS)
    expect(result.rssItems.length).toBeLessThanOrEqual(4) // RANK_PER_PILLAR_CAP
  })

  it('caps at the global rss cap', async () => {
    const context = makeContext(20, 0)
    mockRankings(
      Array.from({ length: 20 }, (_, i) => ({ index: i + 1, score: 8, bestPillar: null }))
    )

    const result = await rankSourceItems(context, OPTS)
    expect(result.rssItems).toHaveLength(RANKED_RSS_CAP)
  })

  it('passes through unchanged when the call throws', async () => {
    const context = makeContext(10, 0)
    callAnthropic.mockRejectedValue(new Error('model down'))

    const result = await rankSourceItems(context, OPTS)
    expect(result).toBe(context)
  })

  it('passes through unchanged when everything is filtered out', async () => {
    const context = makeContext(10, 0)
    mockRankings(Array.from({ length: 10 }, (_, i) => ({ index: i + 1, score: 1 })))

    const result = await rankSourceItems(context, OPTS)
    expect(result).toBe(context)
  })

  it('runs the judge cold at temperature 0', async () => {
    const context = makeContext(8, 0)
    mockRankings(Array.from({ length: 8 }, (_, i) => ({ index: i + 1, score: 8 })))

    await rankSourceItems(context, OPTS)
    expect(callAnthropic).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0 }))
  })

  it('exposes a sane minimum-items constant', () => {
    expect(RANK_MIN_ITEMS).toBeGreaterThan(0)
  })
})

describe('computeSourceBoost', () => {
  it('returns 0 with no history', () => {
    expect(computeSourceBoost(undefined)).toBe(0)
    expect(computeSourceBoost({ clientSourceId: 's', approvedCount: 0, discardedCount: 0 })).toBe(0)
  })

  it('boosts approved sources and sinks discarded ones symmetrically', () => {
    const approved = computeSourceBoost({ clientSourceId: 's', approvedCount: 3, discardedCount: 0 })
    const discarded = computeSourceBoost({ clientSourceId: 's', approvedCount: 0, discardedCount: 3 })
    expect(approved).toBeGreaterThan(0)
    expect(discarded).toBe(-approved)
  })

  it('clamps at ±2 no matter how lopsided the history', () => {
    expect(
      computeSourceBoost({ clientSourceId: 's', approvedCount: 1000, discardedCount: 0 })
    ).toBe(2)
    expect(
      computeSourceBoost({ clientSourceId: 's', approvedCount: 0, discardedCount: 1000 })
    ).toBe(-2)
  })

  it('lifts a borderline item over the threshold when its source has approvals', async () => {
    const context = makeContext(8, 0)
    context.rssItems.forEach((item) => {
      ;(item as { clientSourceId?: string }).clientSourceId = 'feed-1'
    })
    // All items score 3 (below threshold 4) — history boost must rescue them
    mockRankings(Array.from({ length: 8 }, (_, i) => ({ index: i + 1, score: 3 })))

    const boosted = await rankSourceItems(context, {
      ...OPTS,
      sourceStats: [{ clientSourceId: 'feed-1', approvedCount: 7, discardedCount: 0 }],
    })
    expect(boosted.rssItems.length).toBeGreaterThan(0)

    const unboosted = await rankSourceItems(context, OPTS)
    expect(unboosted).toBe(context) // all filtered -> passthrough guard
  })
})

import { describe, it, expect, vi } from 'vitest'

// research-orchestrator transitively imports the real AI client, which
// requires ANTHROPIC_API_KEY at module load — mock it out
vi.mock('@/utils/ai-client')

import { interleaveRoundRobin } from '@/utils/interleave'
import { RssResearchSource } from '../sources/rss-source'
import { WebsiteResearchSource } from '../sources/website-source'
import { FileResearchSource } from '../sources/file-source'
import type { ClientSourceRow } from '../types'

function makeRow(overrides: Partial<ClientSourceRow>): ClientSourceRow {
  return {
    id: 'src-1',
    type: 'rss',
    label: 'Feed',
    url: 'https://example.com/feed',
    config: {},
    pillar_ids: [],
    extracted_text: null,
    ...overrides,
  } as ClientSourceRow
}

describe('interleaveRoundRobin', () => {
  it('takes one item per list per pass until the cap', () => {
    const lists = [
      ['a1', 'a2', 'a3'],
      ['b1', 'b2', 'b3'],
      ['c1', 'c2', 'c3'],
    ]
    expect(interleaveRoundRobin(lists, 6)).toEqual(['a1', 'b1', 'c1', 'a2', 'b2', 'c2'])
  })

  it('no single list can crowd out the others', () => {
    const lists = [['a1', 'a2', 'a3', 'a4', 'a5', 'a6'], ['b1'], ['c1', 'c2']]
    const result = interleaveRoundRobin(lists, 4)
    expect(result).toContain('b1')
    expect(result).toContain('c1')
  })

  it('handles uneven lists and empty lists', () => {
    const lists = [['a1'], [], ['c1', 'c2']]
    expect(interleaveRoundRobin(lists, 10)).toEqual(['a1', 'c1', 'c2'])
  })

  it('returns empty for no lists', () => {
    expect(interleaveRoundRobin([], 5)).toEqual([])
  })
})

describe('addToAttributionIndex', () => {
  it('maps rss item links to the source id', async () => {
    const source = new RssResearchSource(makeRow({ id: 'rss-1' }))
    // Seed fetched items via the private field the accessor reads
    Object.assign(source, {
      items: [
        { title: 't1', description: 'd', link: 'https://a.com/1', pubDate: null },
        { title: 't2', description: 'd', link: 'https://a.com/2', pubDate: null },
      ],
    })

    const byUrl = new Map<string, string>()
    const byLabel = new Map<string, string>()
    source.addToAttributionIndex(byUrl, byLabel)

    expect(byUrl.get('https://a.com/1')).toBe('rss-1')
    expect(byUrl.get('https://a.com/2')).toBe('rss-1')
    expect(byLabel.size).toBe(0)
  })

  it('maps website excerpt urls to the source id', () => {
    const source = new WebsiteResearchSource(
      makeRow({ id: 'web-1', type: 'website', url: 'https://site.com' })
    )
    Object.assign(source, {
      excerpts: [{ url: 'https://site.com/about', text: 'content' }],
    })

    const byUrl = new Map<string, string>()
    source.addToAttributionIndex(byUrl, new Map())

    expect(byUrl.get('https://site.com/about')).toBe('web-1')
  })

  it('maps file labels to the source id', () => {
    const source = new FileResearchSource(
      makeRow({ id: 'file-1', type: 'file', label: 'Price list', extracted_text: 'text' })
    )

    const byLabel = new Map<string, string>()
    source.addToAttributionIndex(new Map(), byLabel)

    expect(byLabel.get('Price list')).toBe('file-1')
  })
})

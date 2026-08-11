import { describe, it, expect, vi } from 'vitest'

// The module under test imports the AI client, whose top-level env assertion
// would fail in the test environment.
vi.mock('@/utils/ai-client')

import { dedupeIntoGroups } from '../fetch-trend-search'
import type { TrendSearchResult } from '../fetch-trend-search'

function item(url: string, score: number): TrendSearchResult {
  return { title: url, snippet: 's', url, score }
}

describe('dedupeIntoGroups', () => {
  it('keeps items in their own query group', () => {
    const groups = dedupeIntoGroups(
      [
        [item('a', 0.9), item('b', 0.8)],
        [item('c', 0.7)],
      ],
      0.3
    )

    expect(groups.map((g) => g.map((i) => i.url))).toEqual([['a', 'b'], ['c']])
  })

  it('a shared URL survives once, in the higher-scoring query group', () => {
    // Losing provenance here would let one prolific query crowd the others —
    // including a brief's focus query — out of the round-robin cap.
    const groups = dedupeIntoGroups(
      [
        [item('shared', 0.5)],
        [item('shared', 0.9), item('own', 0.6)],
      ],
      0.3
    )

    expect(groups[0]).toEqual([])
    expect(groups[1]?.map((i) => i.url).sort()).toEqual(['own', 'shared'])
  })

  it('drops items below the score threshold and keeps empty groups aligned', () => {
    const groups = dedupeIntoGroups([[item('weak', 0.1)], [item('strong', 0.8)]], 0.3)

    expect(groups).toHaveLength(2)
    expect(groups[0]).toEqual([])
    expect(groups[1]?.map((i) => i.url)).toEqual(['strong'])
  })
})

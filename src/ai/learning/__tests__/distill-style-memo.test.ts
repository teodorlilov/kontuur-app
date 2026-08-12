import { describe, it, expect, vi } from 'vitest'

// The module under test imports ai-client transitively, which throws without an
// API key at import time — only the pure merge logic runs here.
vi.mock('@/utils/ai-client')

import { mergeMemo, STYLE_MEMO_MAX_BULLETS } from '../distill-style-memo'
import { parseMemoBullets } from '@/lib/learning/style-memo'

const NOW = '2026-08-11T12:00:00.000Z'

function bullet(rule: string, evidence_count = 1, last_seen = NOW) {
  return { rule, evidence_count, last_seen }
}

describe('mergeMemo', () => {
  it('a matching proposal strengthens the existing bullet without rewording it', () => {
    const merged = mergeMemo(
      [bullet('Use ангажираност instead of engagement rate', 2, '2026-07-01T00:00:00Z')],
      [{ rule: 'Prefer ангажираност over the English term', matches_existing_index: 0 }],
      NOW
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]!.rule).toBe('Use ангажираност instead of engagement rate')
    expect(merged[0]!.evidence_count).toBe(3)
    expect(merged[0]!.last_seen).toBe(NOW)
  })

  it('a new proposal appends with evidence 1; empty rules are dropped', () => {
    const merged = mergeMemo(
      [],
      [
        { rule: 'Never end a post with a rhetorical question', matches_existing_index: null },
        { rule: '   ', matches_existing_index: null },
      ],
      NOW
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]!.evidence_count).toBe(1)
  })

  it('an out-of-range match index is treated as a new rule, not a crash', () => {
    const merged = mergeMemo([], [{ rule: 'Keep CTAs concrete', matches_existing_index: 7 }], NOW)
    expect(merged).toHaveLength(1)
  })

  it('unconfirmed bullets expire after 60 days; confirmed ones survive', () => {
    const stale = bullet('old rule', 5, '2026-06-01T00:00:00Z')
    const fresh = bullet('recent rule', 1, '2026-08-01T00:00:00Z')
    const merged = mergeMemo([stale, fresh], [], NOW)
    expect(merged.map((b) => b.rule)).toEqual(['recent rule'])
  })

  it('caps at the max, keeping the best-evidenced rules', () => {
    const existing = Array.from({ length: STYLE_MEMO_MAX_BULLETS }, (_, i) =>
      bullet(`rule ${i}`, i + 2)
    )
    const merged = mergeMemo(existing, [{ rule: 'newcomer', matches_existing_index: null }], NOW)
    expect(merged).toHaveLength(STYLE_MEMO_MAX_BULLETS)
    // The newcomer (evidence 1) loses to every established rule (evidence ≥2)
    expect(merged.some((b) => b.rule === 'newcomer')).toBe(false)
  })
})

describe('parseMemoBullets', () => {
  it('accepts well-formed rows and rejects malformed jsonb defensively', () => {
    expect(parseMemoBullets([bullet('a'), { rule: 1 }, null, 'x'] as never)).toHaveLength(1)
    expect(parseMemoBullets(null)).toEqual([])
    expect(parseMemoBullets({} as never)).toEqual([])
  })
})

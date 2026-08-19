import { describe, it, expect } from 'vitest'
import { computeRunPlan, allocationCostOfSkips } from '../run-plan'
import { allocateByWeight, type WeightedPillar } from '@/lib/clients/content-pillars'
import type { ClientSourceSummary } from '@/lib/queries/db'
import type { MetaConnection } from '@/types/api'

const pillars: WeightedPillar[] = [
  { id: 'a', pillar: 'Meta ads', weight: 40 },
  { id: 'b', pillar: 'Google ads', weight: 30 },
  { id: 'c', pillar: 'AI marketing', weight: 20 },
  { id: 'd', pillar: 'Tips', weight: 10 },
]

function source(overrides: Partial<ClientSourceSummary>): ClientSourceSummary {
  return {
    id: 's1',
    type: 'rss',
    label: 'Feed',
    url: 'https://x.test',
    pillar_ids: [],
    ...overrides,
  }
}

function connection(overrides: Partial<MetaConnection>): MetaConnection {
  return {
    id: 'c1',
    platform: 'instagram',
    account_id: 'acc',
    account_name: 'Acc',
    token_expires_at: null,
    created_at: '2026-01-01',
    ...overrides,
  }
}

const base = {
  pillars,
  targetPostCount: 3,
  sources: [source({})],
  connections: [connection({})],
  platform: 'Instagram',
}

describe('computeRunPlan', () => {
  it('matches allocateByWeight per pillar, in pillar order', () => {
    const plan = computeRunPlan(base)
    const expected = allocateByWeight(pillars, 3)
    expect(plan.allocation.map((a) => a.pillar.pillar)).toEqual(pillars.map((p) => p.pillar))
    for (const a of plan.allocation) {
      expect(a.count).toBe(expected.get(a.pillar.pillar) ?? 0)
    }
  })

  it('a source with empty pillar_ids feeds every pillar', () => {
    const plan = computeRunPlan({ ...base, sources: [source({ pillar_ids: [] })] })
    expect(plan.starvedPillars).toEqual([])
    expect(plan.webOnlyPillars).toEqual([])
  })

  it('detects starved pillars from scoped sources', () => {
    const plan = computeRunPlan({ ...base, sources: [source({ pillar_ids: ['a', 'b'] })] })
    expect(plan.starvedPillars).toEqual(['AI marketing', 'Tips'])
  })

  it('an unlimited tavily source keeps unfed pillars as web-only, never starved', () => {
    const plan = computeRunPlan({
      ...base,
      sources: [source({ pillar_ids: ['a'] }), source({ id: 's2', type: 'tavily' })],
    })
    expect(plan.webResearchActive).toBe(true)
    // tavily is not a content source: those pillars ride on the search landing
    expect(plan.starvedPillars).toEqual([])
    expect(plan.webOnlyPillars).toEqual(['Google ads', 'AI marketing', 'Tips'])
    expect(plan.allocation.map((a) => a.coverage)).toEqual(['content', 'web', 'web', 'web'])
  })

  it("a pillar assigned in tavily's own topic limit is web, never starved", () => {
    // The panel used to ignore the Topics assignment on the web research card
    // and show "no sources" for pillars deliberately routed to it.
    const plan = computeRunPlan({
      ...base,
      sources: [source({ id: 's2', type: 'tavily', pillar_ids: ['a', 'b'] })],
    })
    expect(plan.webOnlyPillars).toEqual(['Meta ads', 'Google ads'])
    expect(plan.starvedPillars).toEqual(['AI marketing', 'Tips'])
    // The run redistributes: skipped pillars carry no count, fed pillars carry
    // the whole target — a count on a "skipped" row is a self-contradiction.
    expect(plan.allocation.filter((a) => a.coverage === 'none').every((a) => a.count === 0)).toBe(
      true
    )
    expect(plan.allocation.reduce((sum, a) => sum + a.count, 0)).toBe(3)
  })

  it('without tavily, starved pillars are a hard skip', () => {
    const plan = computeRunPlan({ ...base, sources: [source({ pillar_ids: ['a'] })] })
    expect(plan.webResearchActive).toBe(false)
    expect(plan.starvedPillars).toEqual(['Google ads', 'AI marketing', 'Tips'])
    expect(plan.webOnlyPillars).toEqual([])
  })

  it('a source whose pillar_ids all point at deleted pillars feeds everything', () => {
    const plan = computeRunPlan({ ...base, sources: [source({ pillar_ids: ['deleted'] })] })
    expect(plan.starvedPillars).toEqual([])
    expect(plan.webOnlyPillars).toEqual([])
  })

  describe('publishState', () => {
    it('live platform with a valid connection → connected', () => {
      expect(computeRunPlan(base).publishState).toEqual({ kind: 'connected' })
    })

    it('live platform with an expired token → not_connected', () => {
      const plan = computeRunPlan({
        ...base,
        connections: [connection({ token_expires_at: '2020-01-01T00:00:00Z' })],
      })
      expect(plan.publishState).toEqual({ kind: 'not_connected' })
    })

    it('live platform with no connection row → not_connected', () => {
      const plan = computeRunPlan({ ...base, connections: [] })
      expect(plan.publishState).toEqual({ kind: 'not_connected' })
    })

    it('connection for another platform does not count', () => {
      const plan = computeRunPlan({
        ...base,
        // WHY the assertion: Canva rows share social_connections and reach this
        // list at runtime; the type narrows to 'instagram' but the check must
        // still refuse to treat a Canva row as a publishing connection.
        connections: [connection({ platform: 'canva' as MetaConnection['platform'] })],
      })
      expect(plan.publishState).toEqual({ kind: 'not_connected' })
    })

    it('non-live platform → manual regardless of connections', () => {
      const plan = computeRunPlan({ ...base, platform: 'LinkedIn' })
      expect(plan.publishState).toEqual({ kind: 'manual' })
    })
  })
})

describe('allocationCostOfSkips', () => {
  it('sums the skipped pillars’ allocated counts', () => {
    const plan = computeRunPlan({ ...base, targetPostCount: 10 })
    const cost = allocationCostOfSkips(plan.allocation, ['Meta ads', 'Tips'])
    const expected = allocateByWeight(pillars, 10)
    expect(cost).toBe((expected.get('Meta ads') ?? 0) + (expected.get('Tips') ?? 0))
  })

  it('returns 0 for a skipped pillar that was allocated nothing', () => {
    // At 3 posts across 40/30/20/10, the 10% pillar gets nothing
    const plan = computeRunPlan(base)
    expect(plan.allocation.find((a) => a.pillar.pillar === 'Tips')?.count).toBe(0)
    expect(allocationCostOfSkips(plan.allocation, ['Tips'])).toBe(0)
  })
})

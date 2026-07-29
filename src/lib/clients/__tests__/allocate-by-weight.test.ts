import { describe, it, expect } from 'vitest'
import { allocateByWeight, type WeightedPillar } from '../content-pillars'

const PILLARS: WeightedPillar[] = [
  { id: 'p1', pillar: 'Services', weight: 40 },
  { id: 'p2', pillar: 'Educational', weight: 30 },
  { id: 'p3', pillar: 'Behind the scenes', weight: 20 },
  { id: 'p4', pillar: 'Testimonials', weight: 10 },
]

describe('allocateByWeight (memoryless)', () => {
  it('is unchanged without history: heaviest pillars win small batches', () => {
    const allocation = allocateByWeight(PILLARS, 3)
    expect(allocation.get('Services')).toBe(1)
    expect(allocation.get('Educational')).toBe(1)
    expect(allocation.get('Behind the scenes')).toBe(1)
    expect(allocation.get('Testimonials')).toBe(0)
  })

  it('sums to the requested total', () => {
    for (const total of [1, 3, 5, 10]) {
      const allocation = allocateByWeight(PILLARS, total)
      const sum = [...allocation.values()].reduce((s, v) => s + v, 0)
      expect(sum).toBe(total)
    }
  })
})

describe('allocateByWeight (deficit-aware)', () => {
  it('routes the marginal post to the most under-served pillar', () => {
    // History: Testimonials (10%) has never appeared in 10 recent posts
    const history = new Map([
      ['Services', 5],
      ['Educational', 3],
      ['Behind the scenes', 2],
    ])
    const allocation = allocateByWeight(PILLARS, 3, history)
    expect(allocation.get('Testimonials')).toBe(1)
  })

  it('every pillar appears within consecutive small batches', () => {
    // Simulate 4 runs of 3 posts, feeding each run's output back into history
    const history = new Map<string, number>()
    const seen = new Set<string>()

    for (let run = 0; run < 4; run++) {
      const allocation = allocateByWeight(PILLARS, 3, history)
      for (const [pillar, count] of allocation) {
        if (count > 0) {
          seen.add(pillar)
          history.set(pillar, (history.get(pillar) ?? 0) + count)
        }
      }
    }

    expect(seen.size).toBe(4) // no pillar starved across runs
  })

  it('empty history behaves identically to the memoryless allocation', () => {
    const withEmpty = allocateByWeight(PILLARS, 3, new Map())
    const without = allocateByWeight(PILLARS, 3)
    expect([...withEmpty.entries()]).toEqual([...without.entries()])
  })

  it('over-served pillars lose the marginal post even with high weight', () => {
    // Services (40%) already dominates history far beyond its share
    const history = new Map([
      ['Services', 9],
      ['Educational', 1],
    ])
    const allocation = allocateByWeight(PILLARS, 2, history)
    expect(allocation.get('Services')).toBe(0)
  })
})

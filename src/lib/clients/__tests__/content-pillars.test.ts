import { describe, it, expect } from 'vitest'
import {
  ensurePillarIds,
  parsePillars,
  serializePillars,
  resolveEffectivePillarIds,
  computePillarCoverage,
} from '../content-pillars'

describe('ensurePillarIds', () => {
  it('stamps an id on generator output, which arrives without one', () => {
    // The exact shape the onboarding generator returns. Rendering these in the pillar editor
    // without ids keyed every row `undefined`, which React rejects as a duplicate key.
    const fromGenerator = [
      { pillar: 'Educational', weight: 40 },
      { pillar: 'Services', weight: 35 },
      { pillar: 'Testimonials', weight: 25 },
    ]

    const withIds = ensurePillarIds(fromGenerator)

    expect(withIds.every((p) => typeof p.id === 'string' && p.id.length > 0)).toBe(true)
    expect(new Set(withIds.map((p) => p.id)).size).toBe(3)
  })

  it('preserves ids that are already present', () => {
    const existing = [
      { id: 'keep-me', pillar: 'Educational', weight: 60 },
      { pillar: 'Services', weight: 40 },
    ]

    const [first, second] = ensurePillarIds(existing)

    expect(first!.id).toBe('keep-me')
    expect(second!.id).not.toBe('')
  })

  it('leaves pillar names and weights untouched', () => {
    const result = ensurePillarIds([{ pillar: 'Educational', weight: 40 }])
    expect(result[0]).toMatchObject({ pillar: 'Educational', weight: 40 })
  })

  it('round-trips through serialize/parse without regenerating ids', () => {
    const original = ensurePillarIds([{ pillar: 'Educational', weight: 100 }])
    const reparsed = parsePillars(serializePillars(original))
    expect(reparsed[0]!.id).toBe(original[0]!.id)
  })
})

describe('parsePillars', () => {
  it('assigns ids to legacy rows stored without them', () => {
    const legacy = JSON.stringify([{ pillar: 'Educational', weight: 100 }])
    expect(parsePillars(legacy)[0]!.id).toBeTruthy()
  })

  it('returns an empty list for null, blank and malformed input', () => {
    expect(parsePillars(null)).toEqual([])
    expect(parsePillars('   ')).toEqual([])
    expect(parsePillars('not json')).toEqual([])
    expect(parsePillars('{"not":"an array"}')).toEqual([])
  })

  it('drops entries missing a pillar name or a numeric weight', () => {
    const mixed = JSON.stringify([
      { pillar: 'Good', weight: 50 },
      { pillar: 'No weight' },
      { weight: 50 },
      null,
    ])
    expect(parsePillars(mixed).map((p) => p.pillar)).toEqual(['Good'])
  })
})

const PILLARS = [
  { id: 'p1', pillar: 'Strategy', weight: 40 },
  { id: 'p2', pillar: 'Ads', weight: 30 },
  { id: 'p3', pillar: 'Services', weight: 30 },
]

describe('resolveEffectivePillarIds', () => {
  it('empty and non-array inputs mean feeds-all', () => {
    expect(resolveEffectivePillarIds([], PILLARS)).toEqual([])
    expect(resolveEffectivePillarIds(null, PILLARS)).toEqual([])
  })

  it('keeps only ids that exist on the client today', () => {
    expect(resolveEffectivePillarIds(['p2', 'ghost'], PILLARS)).toEqual(['p2'])
  })

  it('a set of only deleted ids degrades to feeds-all, not feeds-nothing', () => {
    // sync-source-pillars rewrites the column to [] once the last assigned
    // pillar dies; a stale set must behave like the [] it is about to become.
    expect(resolveEffectivePillarIds(['ghost-a', 'ghost-b'], PILLARS)).toEqual([])
  })
})

describe('computePillarCoverage', () => {
  const src = (type: string, label: string, pillar_ids: unknown) => ({ type, label, pillar_ids })

  it('a source with empty pillar_ids feeds every pillar', () => {
    const cov = computePillarCoverage(PILLARS, [src('file', 'brand.pdf', [])])
    for (const p of PILLARS)
      expect(cov.get(p.id)).toEqual({ state: 'content', contentSourceLabels: ['brand.pdf'] })
  })

  it('a scoped source feeds only its pillars; the rest are none without tavily', () => {
    const cov = computePillarCoverage(PILLARS, [src('website', 'site', ['p1'])])
    expect(cov.get('p1')!.state).toBe('content')
    expect(cov.get('p2')!.state).toBe('none')
    expect(cov.get('p3')!.state).toBe('none')
  })

  it('a pillar fed only by an unlimited tavily source is web, never none', () => {
    const cov = computePillarCoverage(PILLARS, [
      src('tavily', 'Web research', []),
      src('website', 'site', ['p1']),
    ])
    expect(cov.get('p1')!.state).toBe('content')
    expect(cov.get('p2')).toEqual({ state: 'web', contentSourceLabels: [] })
  })

  it("respects the tavily source's own topic limit", () => {
    // The generate panel used to ignore this and show "no sources" for pillars
    // deliberately assigned to web research's Topics.
    const cov = computePillarCoverage(PILLARS, [src('tavily', 'Web research', ['p1', 'p2'])])
    expect(cov.get('p1')!.state).toBe('web')
    expect(cov.get('p2')!.state).toBe('web')
    expect(cov.get('p3')!.state).toBe('none')
  })

  it('collects the labels of every content source feeding a pillar, in order', () => {
    const cov = computePillarCoverage(PILLARS, [
      src('website', 'site', ['p2']),
      src('file', 'services.pdf', ['p2', 'p3']),
    ])
    expect(cov.get('p2')!.contentSourceLabels).toEqual(['site', 'services.pdf'])
  })

  it('stale-id sources degrade to feeds-all instead of starving pillars', () => {
    const cov = computePillarCoverage(PILLARS, [src('rss', 'feed', ['deleted-pillar'])])
    for (const p of PILLARS) expect(cov.get(p.id)!.state).toBe('content')
  })
})

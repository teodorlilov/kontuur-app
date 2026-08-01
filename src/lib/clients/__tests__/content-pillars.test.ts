import { describe, it, expect } from 'vitest'
import { ensurePillarIds, parsePillars, serializePillars } from '../content-pillars'

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

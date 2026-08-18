import { describe, it, expect } from 'vitest'
import { describeNewPillarCoverage } from '../pillar-notice'

describe('describeNewPillarCoverage', () => {
  const saved = ['Education', 'Promo']

  it('says nothing when every draft pillar is already saved', () => {
    expect(
      describeNewPillarCoverage(saved, [{ pillar: 'Education' }, { pillar: 'Promo' }], 2)
    ).toBeNull()
  })

  it('says nothing when no unrestricted sources exist', () => {
    expect(describeNewPillarCoverage(saved, [{ pillar: 'New Thing' }], 0)).toBeNull()
  })

  it('names the new pillar and counts the unrestricted sources', () => {
    expect(
      describeNewPillarCoverage(saved, [{ pillar: 'Education' }, { pillar: 'New Thing' }], 2)
    ).toBe('2 sources with no topic limit will also feed “New Thing”.')
  })

  it('singular source, multiple new pillars', () => {
    expect(describeNewPillarCoverage(saved, [{ pillar: 'One' }, { pillar: 'Two' }], 1)).toBe(
      '1 source with no topic limit will also feed “One”, “Two”.'
    )
  })

  it('ignores blank names and case-only differences', () => {
    expect(
      describeNewPillarCoverage(saved, [{ pillar: '  ' }, { pillar: 'education' }], 3)
    ).toBeNull()
  })
})

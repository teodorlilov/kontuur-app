import { describe, it, expect } from 'vitest'
import { describeClearedPillarScoping, describeNewPillarCoverage } from '../pillar-notice'

/**
 * An emptied `pillar_ids` means *feeds every pillar*, not none — so a source losing its last
 * surviving pillar is a widening, silent and invisible on save. These assertions are the only
 * thing standing between that and a one-click pillar replacement.
 */
describe('describeClearedPillarScoping', () => {
  it('says nothing when no source is scoped at all', () => {
    expect(describeClearedPillarScoping([], ['a', 'b'])).toBeNull()
  })

  it('says nothing while every scoped source keeps at least one of its pillars', () => {
    expect(describeClearedPillarScoping([['a'], ['a', 'z']], ['a', 'b'])).toBeNull()
  })

  it('counts only the sources that lose every pillar they were scoped to', () => {
    // ['a'] survives; ['y','z'] and ['x'] do not.
    expect(describeClearedPillarScoping([['a'], ['y', 'z'], ['x']], ['a', 'b'])).toBe(
      '2 sources scoped to the pillars this replaces will go back to feeding every pillar.'
    )
  })

  it('reads as one source in the singular', () => {
    expect(describeClearedPillarScoping([['x']], ['a'])).toBe(
      '1 source scoped to the pillars this replaces will go back to feeding every pillar.'
    )
  })

  it('warns about every scoped source when the replacement keeps no pillar at all', () => {
    // The real case: a website read whose four suggested names match none of the four saved ones.
    expect(describeClearedPillarScoping([['a'], ['b'], ['c']], ['n1', 'n2', 'n3', 'n4'])).toBe(
      '3 sources scoped to the pillars this replaces will go back to feeding every pillar.'
    )
  })
})

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

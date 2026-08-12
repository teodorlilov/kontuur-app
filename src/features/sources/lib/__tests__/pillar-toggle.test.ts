import { describe, it, expect } from 'vitest'
import { togglePillarAssignment } from '../pillar-toggle'

const PILLARS = [
  { id: 'p1', pillar: 'Strategy', weight: 40 },
  { id: 'p2', pillar: 'Ads', weight: 30 },
  { id: 'p3', pillar: 'Services', weight: 30 },
]

describe('togglePillarAssignment', () => {
  it('clicking a chip on a feeds-all source scopes it to everything else', () => {
    expect(togglePillarAssignment([], 'p2', PILLARS)).toEqual(['p1', 'p3'])
  })

  it('adds and removes ordinary members', () => {
    expect(togglePillarAssignment(['p1'], 'p2', PILLARS)).toEqual(['p1', 'p2'])
    expect(togglePillarAssignment(['p1', 'p2'], 'p2', PILLARS)).toEqual(['p1'])
  })

  it('removing the last lit chip snaps back to feeds-all', () => {
    // A source cannot feed nothing — [] is the DB's feeds-all state.
    expect(togglePillarAssignment(['p2'], 'p2', PILLARS)).toEqual([])
  })

  it('lighting the last unlit chip collapses to feeds-all', () => {
    // Explicit-all would stop following pillars added later; [] keeps the
    // "including ones you add later" caption true whenever it shows.
    expect(togglePillarAssignment(['p1', 'p2'], 'p3', PILLARS)).toEqual([])
  })

  it('stale ids behave like the feeds-all they degrade to', () => {
    expect(togglePillarAssignment(['deleted'], 'p1', PILLARS)).toEqual(['p2', 'p3'])
  })
})

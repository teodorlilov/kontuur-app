import { describe, it, expect } from 'vitest'
import { ORDERED_STAGE_LABELS, STAGE_LABELS } from '../stages'
import { GENERATION_STAGES, stageIndex } from '../stream-events'

/**
 * The rail used to infer its stage by substring-matching the phase prose, and got it
 * wrong in both directions: "Quality checks" was unreachable because no server phase
 * contained quality/validat/check, and "Generating theme ideas…" matched
 * `includes('generat')` before the research branch, so research reported itself as
 * writing. `setLoadingStage` is Math.max-monotonic, so that first wrong guess stuck
 * for the rest of the run. The server states its stage now; these pin the contract
 * that replaced the guessing.
 */
describe('generation stages', () => {
  it('runs sources → research → writing → quality, in that order', () => {
    // The rail advances monotonically, so the order *is* the behaviour: a stage
    // declared out of order would let a later phase move the rail backwards, which
    // Math.max would then silently swallow.
    expect(GENERATION_STAGES).toEqual(['sources', 'research', 'writing', 'quality'])
  })

  it('every stage has an index and a label', () => {
    for (const [i, stage] of GENERATION_STAGES.entries()) {
      expect(stageIndex(stage)).toBe(i)
      expect(STAGE_LABELS[stage]).toBeTruthy()
    }
    expect(ORDERED_STAGE_LABELS).toHaveLength(GENERATION_STAGES.length)
  })

  it('exposes one label set, not one per flow', () => {
    // There were two, and the idea flow's second label named `searchForIdea` — a
    // shallow lookup deleted when the generate routes merged. An idea is now a
    // locked priority brief on the same pipeline.
    expect(ORDERED_STAGE_LABELS).toEqual([
      'Fetching sources',
      'Researching topics',
      'Writing captions and slides',
      'Quality checks',
    ])
  })
})

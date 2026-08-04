import { describe, it, expect } from 'vitest'
import { mapPhaseToStage, STAGE_LABELS, IDEA_STAGE_LABELS } from '../stages'

describe('mapPhaseToStage', () => {
  it('maps quality/validation phrases to stage 3', () => {
    expect(mapPhaseToStage('Running quality validation')).toBe(3)
    expect(mapPhaseToStage('Checking sources')).toBe(3)
  })

  it('maps writing phrases to stage 2', () => {
    expect(mapPhaseToStage('Writing captions')).toBe(2)
    expect(mapPhaseToStage('Generating posts')).toBe(2)
  })

  it('maps research phrases to stage 1', () => {
    expect(mapPhaseToStage('Researching topics for pillar')).toBe(1)
    expect(mapPhaseToStage('Analyzing themes')).toBe(1)
  })

  it('defaults to stage 0 for fetch phrases and unknowns', () => {
    expect(mapPhaseToStage('Fetching sources...')).toBe(0)
    expect(mapPhaseToStage('')).toBe(0)
  })
})

describe('stage labels', () => {
  it('both flows expose four stages', () => {
    expect(STAGE_LABELS).toHaveLength(4)
    expect(IDEA_STAGE_LABELS).toHaveLength(4)
  })
})

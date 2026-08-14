import { describe, expect, it } from 'vitest'
import { POST_STATUS_CHIP } from '../lib/post-status-chip'
import { PILL_TONES } from '@/components/ui/status-pill'
import { POST_STATUSES } from '@/lib/validation'

/**
 * The map is the app's one answer to "what colour is this status", so the thing worth
 * asserting is coverage and provenance, not the individual pairings: a status with no
 * entry would render `undefined` classes, and a tone invented here rather than taken
 * from PILL_TONES would be the eighth independent status-colour definition — which is
 * exactly what this file exists to prevent.
 */
describe('POST_STATUS_CHIP', () => {
  it('covers every status the database can hold', () => {
    expect(Object.keys(POST_STATUS_CHIP).sort()).toEqual([...POST_STATUSES].sort())
  })

  it('only uses tones that exist in PILL_TONES', () => {
    for (const { tone } of Object.values(POST_STATUS_CHIP)) {
      expect(PILL_TONES).toHaveProperty(tone)
    }
  })

  it('gives every status a human label', () => {
    for (const { label } of Object.values(POST_STATUS_CHIP)) {
      expect(label).toMatch(/^[A-Z]/)
    }
  })

  it('honours the two pairings DESIGN.md fixes by name', () => {
    // Wash on Deep Pine, and Marker on Pine Deep. `mark` would be the lime plate,
    // which the Standing Place Rule reserves for where the user is standing.
    expect(POST_STATUS_CHIP.published.tone).toBe('ok')
    expect(POST_STATUS_CHIP.scheduled.tone).toBe('marker')
    expect(POST_STATUS_CHIP.failed.tone).toBe('bad')
  })
})

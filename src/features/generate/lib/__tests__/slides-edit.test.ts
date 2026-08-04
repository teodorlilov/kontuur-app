import { describe, it, expect } from 'vitest'
import { updateSlideField } from '../slides-edit'

const slides = [
  { slide_number: 1, headline: 'Cover', body: 'Cover body' },
  { slide_number: 2, headline: 'Second', body: 'Second body' },
]

describe('updateSlideField', () => {
  it('replaces one field of one slide, leaving siblings untouched', () => {
    const updated = updateSlideField(slides, 1, 'headline', 'Edited')
    expect(updated[1]).toEqual({ slide_number: 2, headline: 'Edited', body: 'Second body' })
    expect(updated[0]).toEqual(slides[0])
  })

  it('returns [] for malformed input, matching parseSlides (arrays only)', () => {
    expect(updateSlideField(null, 0, 'headline', 'x')).toEqual([])
    expect(updateSlideField(JSON.stringify(slides), 0, 'headline', 'x')).toEqual([])
  })
})

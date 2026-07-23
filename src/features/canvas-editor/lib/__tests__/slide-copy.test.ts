import { describe, expect, it } from 'vitest'
import { slideCopyAt } from '../slide-copy'

const slides = [
  { headline: 'Hook', body: '' },
  { headline: 'Insight', body: 'The core point.' },
]

describe('slideCopyAt', () => {
  it('returns the carousel slide at the position', () => {
    expect(slideCopyAt({ post_type: 'carousel', slides_json: slides, caption: 'cap' }, 1)).toEqual({
      kind: 'slide',
      headline: 'Insight',
      body: 'The core point.',
    })
  })

  it('returns null for a position beyond the actual slides', () => {
    expect(slideCopyAt({ post_type: 'carousel', slides_json: slides, caption: null }, 5)).toBeNull()
  })

  it('returns null for malformed slides_json on a carousel', () => {
    expect(slideCopyAt({ post_type: 'carousel', slides_json: 'not-an-array', caption: null }, 0)).toBeNull()
  })

  it('returns the caption for single posts', () => {
    expect(slideCopyAt({ post_type: 'single', slides_json: null, caption: 'Big news!' }, 0)).toEqual({
      kind: 'caption',
      caption: 'Big news!',
    })
  })
})

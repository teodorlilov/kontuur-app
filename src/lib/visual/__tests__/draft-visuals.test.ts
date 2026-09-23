import { describe, expect, it } from 'vitest'
import { countVisualsByStatus, type DraftVisual } from '../draft-visuals'

const visuals: DraftVisual[] = [
  { position: 0, status: 'done', publicUrl: 'https://x.test/0.jpg', storagePath: 'c1/p1/0.jpg' },
  {
    position: 1,
    status: 'generating',
    publicUrl: 'https://x.test/1.jpg',
    storagePath: 'c1/p1/1.jpg',
  },
  { position: 2, status: 'generating' },
  { position: 3, status: 'error' },
]

describe('countVisualsByStatus', () => {
  it('tallies error, generating and done independently', () => {
    expect(countVisualsByStatus(visuals)).toEqual({ failed: 1, composing: 2, done: 1 })
  })

  it('handles undefined and empty', () => {
    expect(countVisualsByStatus(undefined)).toEqual({ failed: 0, composing: 0, done: 0 })
    expect(countVisualsByStatus([])).toEqual({ failed: 0, composing: 0, done: 0 })
  })
})

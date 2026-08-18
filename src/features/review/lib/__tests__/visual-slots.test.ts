import { describe, it, expect } from 'vitest'
import { toVisualSlots } from '../visual-slots'
import type { PostImage } from '@/types/api'

function image(position: number): PostImage {
  return {
    id: `img-${position}`,
    publicUrl: `https://cdn/img-${position}.jpg`,
    storagePath: `posts/img-${position}.jpg`,
    position,
    fileName: null,
    fileSize: null,
    contentType: null,
  }
}

describe('toVisualSlots', () => {
  it('persisted images become done slots with their refs', () => {
    const slots = toVisualSlots([image(0), image(1)], [], [], 2)
    expect(slots).toHaveLength(2)
    expect(slots[0]).toMatchObject({
      position: 0,
      status: 'done',
      publicUrl: 'https://cdn/img-0.jpg',
    })
  })

  it('a position with neither image nor job is omitted — the empty frame renders', () => {
    const slots = toVisualSlots([image(0)], [], [], 3)
    expect(slots.map((s) => s.position)).toEqual([0])
  })

  it('an in-flight regeneration without an image yet shows a bare generating slot', () => {
    const slots = toVisualSlots([], [1], [], 2)
    expect(slots).toEqual([{ position: 1, status: 'generating' }])
  })

  it('mid-compose keeps the clean refs so an approve attaches the clean art', () => {
    const slots = toVisualSlots([image(0)], [], [0], 1)
    expect(slots[0]).toMatchObject({
      status: 'generating',
      publicUrl: 'https://cdn/img-0.jpg',
      storagePath: 'posts/img-0.jpg',
    })
  })

  it('a regenerating position that still has its old image keeps showing it', () => {
    const slots = toVisualSlots([image(2)], [2], [], 3)
    expect(slots[0]).toMatchObject({
      position: 2,
      status: 'generating',
      publicUrl: 'https://cdn/img-2.jpg',
    })
  })
})

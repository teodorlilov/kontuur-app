import { describe, it, expect } from 'vitest'
import { upsertImageAtPosition, missingImagePositions } from '../image-list'
import type { PostImage } from '@/types/api'

function makeImage(position: number, id = `img-${position}`): PostImage {
  return { id, publicUrl: `https://x/${id}.jpg`, storagePath: `c/p/${id}.jpg`, position, fileName: null, fileSize: null, contentType: null }
}

describe('upsertImageAtPosition', () => {
  it('replaces the image at the same position and keeps the list sorted', () => {
    const list = [makeImage(0), makeImage(2)]
    const next = upsertImageAtPosition(list, makeImage(2, 'replacement'))
    expect(next.map((img) => img.id)).toEqual(['img-0', 'replacement'])
    const inserted = upsertImageAtPosition(next, makeImage(1))
    expect(inserted.map((img) => img.position)).toEqual([0, 1, 2])
  })
})

describe('missingImagePositions', () => {
  it('returns slots without an image, excluding ones already generating', () => {
    expect(missingImagePositions([makeImage(1)], 4, [2])).toEqual([0, 3])
  })

  it('returns an empty list when every slot is filled', () => {
    expect(missingImagePositions([makeImage(0)], 1, [])).toEqual([])
  })
})

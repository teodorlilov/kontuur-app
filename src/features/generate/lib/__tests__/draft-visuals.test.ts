import { describe, expect, it } from 'vitest'
import type { CanvasDoc } from '@/types/canvas'
import { completedDraftImages, draftStoragePaths, type DraftVisual } from '../draft-visuals'

const doc = {
  version: 1,
  canvas: { w: 1080, h: 1350 },
  background: { publicUrl: 'https://x.test/clean.jpg', storagePath: 'c1/drafts/d1/clean.jpg' },
  flattenedStoragePath: 'c1/drafts/d1/flat.jpg',
  scrim: { enabled: true, color: '#FFFFFF', opacity: 0.35, mode: 'bottom' },
  layers: [],
} satisfies CanvasDoc

const visuals: DraftVisual[] = [
  { position: 0, status: 'done', publicUrl: 'https://x.test/flat.jpg', storagePath: 'c1/drafts/d1/flat.jpg', canvasDoc: doc },
  // mid-compose: clean refs present, no doc yet
  { position: 1, status: 'generating', publicUrl: 'https://x.test/clean-1.jpg', storagePath: 'c1/drafts/d1/clean-1.jpg' },
  // still generating the AI image: nothing stored yet
  { position: 2, status: 'generating' },
  { position: 3, status: 'error' },
]

describe('completedDraftImages', () => {
  it('includes anything with a stored file; the doc only rides on done entries', () => {
    expect(completedDraftImages(visuals)).toEqual([
      { position: 0, publicUrl: 'https://x.test/flat.jpg', storagePath: 'c1/drafts/d1/flat.jpg', canvasDoc: doc },
      { position: 1, publicUrl: 'https://x.test/clean-1.jpg', storagePath: 'c1/drafts/d1/clean-1.jpg' },
    ])
  })

  it('handles undefined', () => {
    expect(completedDraftImages(undefined)).toEqual([])
  })
})

describe('draftStoragePaths', () => {
  it('collects flattened files AND doc clean backgrounds, deduped', () => {
    expect(draftStoragePaths(visuals).sort()).toEqual([
      'c1/drafts/d1/clean-1.jpg',
      'c1/drafts/d1/clean.jpg',
      'c1/drafts/d1/flat.jpg',
    ])
  })
})

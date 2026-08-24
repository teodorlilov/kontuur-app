import { describe, expect, it } from 'vitest'
import type { CanvasDoc } from '@/types/canvas'
import {
  completedDraftImages,
  countVisualsByStatus,
  draftStoragePaths,
  type DraftVisual,
} from '../draft-visuals'

const doc = {
  version: 2,
  canvas: { w: 1080, h: 1350 },
  background: { publicUrl: 'https://x.test/clean.jpg', storagePath: 'c1/drafts/d1/clean.jpg' },
  flattenedStoragePath: 'c1/drafts/d1/flat.jpg',
  backdrop: { enabled: true, color: '#FFFFFF', opacity: 0.35 },
  nodes: [],
} satisfies CanvasDoc

const visuals: DraftVisual[] = [
  {
    position: 0,
    status: 'done',
    publicUrl: 'https://x.test/flat.jpg',
    storagePath: 'c1/drafts/d1/flat.jpg',
    canvasDoc: doc,
  },
  // mid-compose: clean refs present, no doc yet
  {
    position: 1,
    status: 'generating',
    publicUrl: 'https://x.test/clean-1.jpg',
    storagePath: 'c1/drafts/d1/clean-1.jpg',
  },
  // still generating the AI image: nothing stored yet
  { position: 2, status: 'generating' },
  { position: 3, status: 'error' },
]

describe('completedDraftImages', () => {
  it('includes anything with a stored file; the doc only rides on done entries', () => {
    expect(completedDraftImages(visuals)).toEqual([
      {
        position: 0,
        publicUrl: 'https://x.test/flat.jpg',
        storagePath: 'c1/drafts/d1/flat.jpg',
        canvasDoc: doc,
      },
      {
        position: 1,
        publicUrl: 'https://x.test/clean-1.jpg',
        storagePath: 'c1/drafts/d1/clean-1.jpg',
      },
    ])
  })

  it('handles undefined', () => {
    expect(completedDraftImages(undefined)).toEqual([])
  })
})

describe('countVisualsByStatus', () => {
  it('tallies error, generating and done independently', () => {
    // Mid-compose entries carry stored refs but still count as composing
    expect(countVisualsByStatus(visuals)).toEqual({ failed: 1, composing: 2, done: 1 })
  })

  it('handles undefined and empty', () => {
    expect(countVisualsByStatus(undefined)).toEqual({ failed: 0, composing: 0, done: 0 })
    expect(countVisualsByStatus([])).toEqual({ failed: 0, composing: 0, done: 0 })
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

  it('collects placed-asset paths from docs, and text nodes contribute none', () => {
    const withAssets: DraftVisual[] = [
      {
        position: 0,
        status: 'done',
        publicUrl: 'https://x.test/flat.jpg',
        storagePath: 'c1/drafts/d1/flat.jpg',
        canvasDoc: {
          ...doc,
          nodes: [
            {
              id: 'e1',
              kind: 'image',
              src: {
                publicUrl: 'https://x.test/logo.png',
                storagePath: 'c1/drafts/d1/assets/logo.png',
              },
              x: 0,
              y: 0,
              width: 100,
              height: 100,
            },
            {
              id: 't1',
              kind: 'text',
              role: 'custom',
              text: 'no file of its own',
              x: 0,
              y: 0,
              width: 400,
              fontFamily: 'Inter',
              fontSize: 40,
              fontWeight: 400,
              fill: '#ffffff',
              align: 'left',
              lineHeight: 1.2,
            },
          ],
        },
      },
    ]
    expect(draftStoragePaths(withAssets)).toContain('c1/drafts/d1/assets/logo.png')
    expect(draftStoragePaths(withAssets)).toHaveLength(3)
  })
})

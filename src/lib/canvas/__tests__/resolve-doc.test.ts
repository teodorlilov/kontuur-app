import { describe, expect, it } from 'vitest'
import type { CanvasDoc } from '@/types/canvas'
import { rebindDocToImage, resolveDocForImage } from '../resolve-doc'

const CLEAN = { publicUrl: 'https://example.test/clean.jpg', storagePath: 'client/post/clean.jpg' }
const BAKED = { publicUrl: 'https://example.test/baked.jpg', storagePath: 'client/post/baked.jpg' }
const FRESH = { publicUrl: 'https://example.test/fresh.jpg', storagePath: 'client/post/fresh.jpg' }

function doc(): CanvasDoc {
  return {
    version: 2,
    canvas: { w: 1080, h: 1350 },
    background: CLEAN,
    backgroundTransform: { zoom: 2, offsetX: 0.25, offsetY: 0.75 },
    flattenedStoragePath: BAKED.storagePath,
    backdrop: { enabled: false, color: '#000000', opacity: 0.4 },
    nodes: [],
  }
}

describe('rebindDocToImage', () => {
  it('adopts the image as the clean background and drops the stale crop', () => {
    const rebound = rebindDocToImage(doc(), FRESH)
    expect(rebound.background).toEqual(FRESH)
    expect(rebound.backgroundTransform).toBeUndefined()
  })

  it('keeps everything else, including the flattened path', () => {
    const before = doc()
    const rebound = rebindDocToImage(before, FRESH)
    expect(rebound.nodes).toBe(before.nodes)
    expect(rebound.backdrop).toBe(before.backdrop)
    expect(rebound.flattenedStoragePath).toBe(before.flattenedStoragePath)
  })
})

describe('rebindDocToImage as a single edit', () => {
  it('adopts the image and drops the crop together, never one without the other', () => {
    // Replacing a background used to be two commits, so one undo landed on the new image still
    // wearing the old image's crop — a state this function exists to make unreachable.
    const rebound = rebindDocToImage(doc(), FRESH)
    expect(rebound.background).toEqual(FRESH)
    expect(rebound.backgroundTransform).toBeUndefined()
    expect(Object.keys(rebound).sort()).toEqual(Object.keys(doc()).sort())
  })
})

describe('resolveDocForImage', () => {
  it('returns the doc untouched when the image is its own baked output', () => {
    const before = doc()
    expect(resolveDocForImage(before, BAKED)).toBe(before)
  })

  it('rebinds when the image changed underneath', () => {
    const resolved = resolveDocForImage(doc(), FRESH)
    expect(resolved.background).toEqual(FRESH)
    expect(resolved.backgroundTransform).toBeUndefined()
  })

  it('rebinds a doc that has never been baked', () => {
    const resolved = resolveDocForImage({ ...doc(), flattenedStoragePath: null }, FRESH)
    expect(resolved.background).toEqual(FRESH)
  })
})

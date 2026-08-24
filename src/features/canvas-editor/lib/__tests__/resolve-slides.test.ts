import { describe, expect, it } from 'vitest'
import type { CanvasDoc } from '@/types/canvas'
import { buildDefaultIdentity } from '@/lib/visual/identity'
import { textNodes } from '@/lib/canvas/doc-nodes'
import { resolveSlideDocs } from '../resolve-slides'
import type { EditorSlide } from '../../types'

const IDENTITY = buildDefaultIdentity()
const CLEAN = { publicUrl: 'https://x.test/clean.jpg', storagePath: 'c1/p1/clean.jpg' }
const BAKED = { publicUrl: 'https://x.test/baked.jpg', storagePath: 'c1/p1/baked.jpg' }
const FRESH = { publicUrl: 'https://x.test/fresh.jpg', storagePath: 'c1/p1/fresh.jpg' }

function storedDoc(): CanvasDoc {
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

function slide(position: number, image = CLEAN, doc?: CanvasDoc | null): EditorSlide {
  return {
    position,
    image,
    slideCopy: { kind: 'slide', headline: `Headline ${position}`, body: `Body ${position}` },
    ...(doc === undefined ? {} : { doc }),
  }
}

describe('resolveSlideDocs', () => {
  it('keys every slide by its own position, not by its order in the list', () => {
    const resolved = resolveSlideDocs([slide(3), slide(0)], () => null, IDENTITY)
    expect([...resolved.keys()].sort()).toEqual([0, 3])
  })

  it('seeds a slide that has no stored doc, from that slide’s own copy', () => {
    const resolved = resolveSlideDocs([slide(0), slide(1)], () => null, IDENTITY)
    expect(resolved.get(0)?.seeded).toBe(true)
    // Each slide seeds from ITS copy — a shared source would put slide 0's words on every slide.
    expect(textNodes(resolved.get(0)!.doc).map((node) => node.text)).toContain('Headline 0')
    expect(textNodes(resolved.get(1)!.doc).map((node) => node.text)).toContain('Headline 1')
  })

  it('keeps a stored doc rendering over its own clean background when the image is our bake', () => {
    const resolved = resolveSlideDocs([slide(0, { ...BAKED })], () => storedDoc(), IDENTITY)
    expect(resolved.get(0)?.seeded).toBe(false)
    expect(resolved.get(0)?.doc.background).toEqual(CLEAN)
    expect(resolved.get(0)?.doc.backgroundTransform).toBeDefined()
  })

  it('rebinds a stored doc when the image changed underneath it', () => {
    const resolved = resolveSlideDocs([slide(0, FRESH)], () => storedDoc(), IDENTITY)
    expect(resolved.get(0)?.doc.background).toEqual(FRESH)
    // The crop was measured against the picture that is gone, so it cannot survive the rebind.
    expect(resolved.get(0)?.doc.backgroundTransform).toBeUndefined()
  })

  it('reads a draft slide’s doc from the slide itself, a post slide’s from the lookup', () => {
    const inMemory = storedDoc()
    const draft = resolveSlideDocs([slide(0, BAKED, inMemory)], (s) => s.doc ?? null, IDENTITY)
    expect(draft.get(0)?.seeded).toBe(false)

    // The same slide with no doc of its own falls back to seeding — the two targets differ only
    // in where the stored doc comes from.
    const missing = resolveSlideDocs([slide(0, BAKED, null)], (s) => s.doc ?? null, IDENTITY)
    expect(missing.get(0)?.seeded).toBe(true)
  })
})

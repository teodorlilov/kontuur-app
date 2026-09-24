import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { PostImage } from '@/types/api'

/**
 * The run's visuals state decides WHAT a draft still needs and keeps what comes back; the
 * generating itself is the shared hook's, mocked here to its calls.
 */

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  composeMissing: vi.fn(),
  recompose: vi.fn(),
  cancel: vi.fn(),
  noteInFlight: vi.fn(),
  onImage: null as null | ((postId: string, image: PostImage) => void),
}))
vi.mock('@/components/posts/use-generate-visuals', () => ({
  useGenerateVisuals: (onImage: (postId: string, image: PostImage) => void) => {
    mocks.onImage = onImage
    return {
      positionsFor: () => ({ generating: [] as number[], composing: [] as number[] }),
      // Nothing in flight in these cases, so a slot is simply the image the draft holds.
      slotsFor: (_post: unknown, images: PostImage[]) =>
        images.map((image) => ({
          position: image.position,
          status: 'done',
          publicUrl: image.publicUrl,
          storagePath: image.storagePath,
        })),
      generate: mocks.generate,
      composeMissing: mocks.composeMissing,
      recompose: mocks.recompose,
      replaceImage: vi.fn(),
      cancel: mocks.cancel,
      noteInFlight: mocks.noteInFlight,
    }
  },
}))

import { useDraftVisuals } from '../use-draft-visuals'

const CAROUSEL = {
  id: 'p1',
  post_type: 'carousel',
  caption: 'Hello',
  slides_json: [
    { headline: 'One', body: '' },
    { headline: 'Two', body: '' },
    { headline: 'Three', body: '' },
  ],
}

function image(position: number, fileName = `visual-${position}.jpg`): PostImage {
  return {
    id: `img-${position}`,
    publicUrl: `https://cdn/p1/${position}.jpg`,
    storagePath: `c1/p1/${position}.jpg`,
    position,
    fileName,
    fileSize: 10,
    contentType: 'image/jpeg',
  }
}

beforeEach(() => {
  mocks.generate.mockReset().mockResolvedValue(undefined)
  mocks.composeMissing.mockReset().mockResolvedValue(undefined)
  mocks.recompose.mockReset().mockResolvedValue(undefined)
  mocks.cancel.mockReset()
  mocks.noteInFlight.mockReset()
})

describe('useDraftVisuals', () => {
  it('a fresh draft owes every slot', () => {
    const { result } = renderHook(() => useDraftVisuals({ canPaint: true }))
    act(() => result.current.enqueuePost(CAROUSEL))
    expect(mocks.generate).toHaveBeenCalledWith(CAROUSEL, [0, 1, 2])
    expect(mocks.composeMissing).not.toHaveBeenCalled()
    expect(result.current.slotsFor(CAROUSEL)).toEqual([])
  })

  it('a resumed draft owes only the missing positions, and text on the clean art it has', () => {
    const { result } = renderHook(() => useDraftVisuals({ canPaint: true }))
    const existing = [image(0), image(1, 'mine.jpg')]
    act(() => result.current.enqueuePost(CAROUSEL, { images: existing, composedPositions: [1] }))

    expect(mocks.generate).toHaveBeenCalledWith(CAROUSEL, [2])
    // Slot 0 is AI art with no doc yet; slot 1 is the user's own file and is never painted over.
    expect(mocks.composeMissing).toHaveBeenCalledWith(CAROUSEL, [existing[0]])
    expect(result.current.slotsFor(CAROUSEL).map((slot) => slot.status)).toEqual(['done', 'done'])
  })

  it('leaves a position that is already being generated to whoever is generating it', () => {
    const { result } = renderHook(() => useDraftVisuals({ canPaint: true }))
    act(() =>
      result.current.enqueuePost(CAROUSEL, { images: [image(0)], generatingPositions: [1] })
    )

    // Slot 1's picture is in flight from the run this flow left behind — asking again would pay
    // for it twice; only slot 2 is genuinely owed.
    expect(mocks.generate).toHaveBeenCalledWith(CAROUSEL, [2])
    // The post, not its id: the hook finishes what lands elsewhere, and baking the slide's text
    // onto it needs the copy.
    expect(mocks.noteInFlight).toHaveBeenCalledWith(CAROUSEL, [1])
  })

  it('keeps a landed picture for a tracked draft and ignores one for a draft it let go', () => {
    const { result } = renderHook(() => useDraftVisuals({ canPaint: true }))
    act(() => result.current.enqueuePost(CAROUSEL))
    act(() => mocks.onImage?.('p1', image(0)))
    expect(result.current.slotsFor(CAROUSEL)).toEqual([
      expect.objectContaining({ position: 0, status: 'done' }),
    ])

    act(() => result.current.abandonDraft('p1'))
    act(() => mocks.onImage?.('p1', image(1)))
    expect(result.current.slotsFor(CAROUSEL)).toEqual([])
    // Approving stops showing the draft; the picture still lands on its row.
    expect(mocks.cancel).not.toHaveBeenCalled()
  })

  it('with the image pool spent it asks for nothing, and still bakes the art that landed', () => {
    const { result } = renderHook(() => useDraftVisuals({ canPaint: false }))
    const existing = [image(0)]
    act(() => result.current.enqueuePost(CAROUSEL, { images: existing }))

    // Every request would be refused, and asking again on each visit to this route is what made
    // one exhausted workspace re-announce the same refusal for every missing slide.
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.composeMissing).toHaveBeenCalledWith(CAROUSEL, existing)
    expect(result.current.slotsFor(CAROUSEL)).toEqual([
      expect.objectContaining({ position: 0, status: 'done' }),
    ])
  })

  it('discarding cancels what is still coming for that draft', () => {
    const { result } = renderHook(() => useDraftVisuals({ canPaint: true }))
    act(() => result.current.enqueuePost(CAROUSEL))
    act(() => result.current.discardDraft('p1'))
    expect(mocks.cancel).toHaveBeenCalledWith('p1')
  })
})

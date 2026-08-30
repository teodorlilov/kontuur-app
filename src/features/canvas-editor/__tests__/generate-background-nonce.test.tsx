import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

/**
 * What the editor's "New picture" sends to separate one press from the next.
 *
 * The strip generates candidates for the user to choose between, so two presses have to arrive with
 * two briefs — the server hashes this value to pick a framing and a treatment. It used to send the
 * slide's current background path, which does not change until a candidate is PICKED, so generating
 * three options to compare sent one nonce three times and returned three takes on a single brief.
 *
 * Driven through the hook rather than a helper, because the defect was never in the format: it was
 * in which value the hook reached for.
 */

// `vi.hoisted`, because `vi.mock` is lifted above every top-level binding in the file — a spy
// declared with `const` above it is still in its temporal dead zone when the factory runs.
const { generateBackgroundAsset } = vi.hoisted(() => ({
  // The parameter is declared so `mock.calls[n][0]` is typed — an argument-less `vi.fn` records a
  // zero-length tuple, and reading the request off it does not compile.
  generateBackgroundAsset: vi.fn(async (_input: { nonce?: string }) => ({
    publicUrl: 'https://cdn/candidate.jpg',
    storagePath: 'client-1/post-1/candidate.jpg',
  })),
}))

vi.mock('../lib/asset-client', () => ({
  generateBackgroundAsset,
  generateSvgAsset: vi.fn(),
  inpaintAsset: vi.fn(),
  isolateSubjectAsset: vi.fn(),
  uploadElementAsset: vi.fn(),
}))
vi.mock('@/components/ui/toast', () => ({ toast: { error: vi.fn(), info: vi.fn() } }))

import { useEditorAiOps } from '../hooks/use-editor-ai-ops'

const BACKGROUND = 'client-1/post-1/1755900000000-background.jpg'

/** The slice of the editor `generateBackground` actually touches; the rest is inert here. */
function inputFor(backgroundPath: string) {
  const doc = {
    background: { publicUrl: 'https://cdn/bg.jpg', storagePath: backgroundPath },
    nodes: [],
  }
  return {
    target: { kind: 'post' as const, postId: 'post-1' },
    jobs: {
      // The live list the hook reads to decide whether THIS slide is busy. Empty: these presses
      // resolve immediately, so nothing is ever in flight while the next one starts.
      jobs: [],
      running: () => false,
      start: () => ({ discarded: () => false, finish: () => {} }),
      find: () => undefined,
    },
    goToSlide: () => {},
    activePosition: 0,
    slideTotal: 3,
    slideCopy: { kind: 'slide' as const, headline: 'A headline', body: 'Some body' },
    docState: { doc, transformDoc: () => {}, addNode: () => {}, replaceNodes: () => {} },
    selection: { ids: [] as string[] },
    modeState: { strokes: [], inpaintPrompt: '', clearStrokes: () => {}, exitMode: () => {} },
    backgroundImage: null,
    canAddNode: () => true,
    // The fixture is deliberately partial: every other field belongs to ops this test never calls,
    // and filling them in would be inventing a contract rather than exercising one.
  } as unknown as Parameters<typeof useEditorAiOps>[0]
}

/** The `nonce` each call carried, in order. */
function noncesSent(): string[] {
  return generateBackgroundAsset.mock.calls.map(([input]) => input.nonce ?? '')
}

beforeEach(() => {
  generateBackgroundAsset.mockClear()
})

describe('generateBackground', () => {
  it('sends a different nonce on every press of the same slide', async () => {
    const { result } = renderHook(() => useEditorAiOps(inputFor(BACKGROUND)))

    await act(async () => {
      await result.current.generateBackground()
    })
    await act(async () => {
      await result.current.generateBackground()
    })
    await act(async () => {
      await result.current.generateBackground()
    })

    const sent = noncesSent()
    expect(sent).toHaveLength(3)
    // The whole point. Picking a candidate is what changes the background, and it has not happened —
    // so anything derived from the background alone is identical across all three of these.
    expect(new Set(sent).size).toBe(3)
  })

  it('advances even when the background never changes', async () => {
    const { result } = renderHook(() => useEditorAiOps(inputFor(BACKGROUND)))

    await act(async () => {
      await result.current.generateBackground()
    })
    await act(async () => {
      await result.current.generateBackground()
    })

    // Both nonces are built on the same background — the counter is what separates them.
    const [first, second] = noncesSent()
    expect(first).toContain(BACKGROUND)
    expect(second).toContain(BACKGROUND)
    expect(first).not.toBe(second)
  })

  it('keeps each slide counting on its own', async () => {
    const first = renderHook(() => useEditorAiOps(inputFor(BACKGROUND)))
    await act(async () => {
      await first.result.current.generateBackground()
    })
    const onSlideZero = noncesSent()[0]

    generateBackgroundAsset.mockClear()
    // A second slide, one position along, with its own picture.
    const second = renderHook(() =>
      useEditorAiOps({
        ...inputFor('client-1/post-1/1755900000001-other.jpg'),
        activePosition: 1,
      } as unknown as Parameters<typeof useEditorAiOps>[0])
    )
    await act(async () => {
      await second.result.current.generateBackground()
    })

    // Slide 1's first press is its own first press, not slide 0's second.
    expect(noncesSent()[0]).not.toBe(onSlideZero)
    expect(noncesSent()[0]).toContain(':0')
  })
})

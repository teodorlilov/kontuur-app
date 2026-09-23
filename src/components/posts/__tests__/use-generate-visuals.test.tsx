import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PostImage } from '@/types/api'

/**
 * One visuals orchestrator for every surface: the queue and the calendar bind it to the post
 * they show, the generate flow drives a whole run through it. What is asserted here is the
 * per-post contract — positions tracked by post, a landed image naming its post, one post's
 * cancel leaving another's work alone.
 */

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }))
vi.mock('@/features/canvas-editor/lib/save-canvas', () => ({
  StaleImageError: class extends Error {},
}))
const composePersistedPosition = vi.fn()
// Null canvas = nothing to bake, which keeps Konva out of this suite; the bake itself is the
// canvas editor's own test. A case that needs the bake to be attempted hands back a canvas.
const loadPostCanvas = vi.fn()
vi.mock('@/features/canvas-editor/lib/auto-compose', () => ({
  composePersistedPosition: (...args: unknown[]) => composePersistedPosition(...args),
  recomposePersistedPosition: vi.fn(),
  loadPostCanvas: (...args: unknown[]) => loadPostCanvas(...args),
}))
const fetchVisualProgress = vi.fn()
vi.mock('@/lib/actions/visual-progress', () => ({
  fetchVisualProgress: (...args: unknown[]) => fetchVisualProgress(...args),
}))
vi.mock('@/lib/posts/upload-slide-image', () => ({
  // `uploadSlideImage` hands back the mapped image, the way the route's row reaches a surface.
  uploadSlideImage: (postId: string, position: number) =>
    Promise.resolve({
      id: `${postId}-${position}`,
      publicUrl: `https://cdn/${postId}/${position}.jpg`,
      storagePath: `c1/${postId}/${position}.jpg`,
      position,
      fileName: 'upload.jpg',
      fileSize: 10,
      contentType: 'image/jpeg',
    }),
}))

import { useGenerateVisuals } from '../use-generate-visuals'

function imageRow(postId: string, position: number, fileName = `visual-${position}.jpg`) {
  return {
    id: `${postId}-${position}`,
    post_id: postId,
    position,
    public_url: `https://cdn/${postId}/${position}.jpg`,
    storage_path: `c1/${postId}/${position}.jpg`,
    file_name: fileName,
    file_size: 10,
    content_type: 'image/jpeg',
    created_at: '2026-09-20T08:00:00.000Z',
  }
}

const POST_A = { id: 'a', post_type: 'single', caption: 'Alpha', slides_json: null }

/** An image as a surface receives it — the mapped shape, not the row. */
function mappedImage(postId: string, position: number): PostImage {
  return {
    id: `${postId}-${position}`,
    publicUrl: `https://cdn/${postId}/${position}.jpg`,
    storagePath: `c1/${postId}/${position}.jpg`,
    position,
    fileName: `visual-${position}.jpg`,
    fileSize: 10,
    contentType: 'image/jpeg',
  }
}
const POST_B = { id: 'b', post_type: 'single', caption: 'Beta', slides_json: null }

/**
 * A fetch whose visual requests the test releases by hand, keyed by post and position. The
 * compose tail's canvas read (`GET …/canvas`) is answered with nothing, which `loadPostCanvas`
 * turns into "skip composing" — only the picture requests are the subject here.
 */
function deferredFetch() {
  const pending = new Map<string, (value: Response) => void>()
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (!url.endsWith('/visuals')) return Promise.reject(new Error('no canvas in this test'))
    const postId = url.split('/')[3] ?? ''
    const { position } = JSON.parse(String(init?.body)) as { position: number }
    return new Promise<Response>((resolve, reject) => {
      pending.set(`${postId}:${position}`, resolve)
      init?.signal?.addEventListener('abort', () =>
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      )
    })
  })
  const land = (postId: string, position: number) =>
    pending.get(`${postId}:${position}`)?.({
      ok: true,
      json: () => Promise.resolve({ image: imageRow(postId, position) }),
    } as unknown as Response)
  const visualRequests = () => fetchMock.mock.calls.filter(([url]) => url.endsWith('/visuals'))
  return { fetchMock, land, visualRequests }
}

beforeEach(() => {
  vi.useRealTimers()
  fetchVisualProgress.mockReset().mockResolvedValue({ ok: true, data: [] })
  composePersistedPosition.mockReset()
  loadPostCanvas.mockReset().mockResolvedValue(null)
})
afterEach(() => vi.unstubAllGlobals())

describe('useGenerateVisuals — a picture being made elsewhere', () => {
  it('asks until the claim is gone, reports what landed, and then stops asking', async () => {
    vi.useFakeTimers()
    const landed: Array<[string, PostImage]> = []
    const { result } = renderHook(() =>
      useGenerateVisuals((postId, image) => landed.push([postId, image]))
    )

    act(() => result.current.noteInFlight(POST_A, [0]))
    expect(result.current.slotsFor(POST_A, [])).toEqual([{ position: 0, status: 'generating' }])

    // Still being made: the slot holds and the loop keeps asking.
    fetchVisualProgress.mockResolvedValue({
      ok: true,
      data: [{ postId: 'a', images: [], generatingPositions: [0] }],
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(fetchVisualProgress).toHaveBeenCalledWith(['a'])
    expect(result.current.slotsFor(POST_A, [])).toEqual([{ position: 0, status: 'generating' }])

    // The claim is gone and a picture is there: it lands, and the position stops being in flight.
    fetchVisualProgress.mockResolvedValue({
      ok: true,
      data: [{ postId: 'a', images: [mappedImage('a', 0)], generatingPositions: [] }],
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(landed).toEqual([['a', expect.objectContaining({ position: 0 })]])
    expect(result.current.slotsFor(POST_A, [])).toEqual([])

    // Nothing left in flight, so the loop is over — no further asking.
    const asked = fetchVisualProgress.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(fetchVisualProgress).toHaveBeenCalledTimes(asked)
    vi.useRealTimers()
  })

  it('bakes the slide text onto a picture another invocation made', async () => {
    vi.useFakeTimers()
    loadPostCanvas.mockResolvedValue({ identity: { palette: {} }, docs: new Map() })
    composePersistedPosition.mockResolvedValue(null)
    const { result } = renderHook(() => useGenerateVisuals(() => {}))

    act(() => result.current.noteInFlight(POST_A, [0]))
    fetchVisualProgress.mockResolvedValue({
      ok: true,
      data: [{ postId: 'a', images: [mappedImage('a', 0)], generatingPositions: [] }],
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })

    // Clean AI art, whoever made it: the person must not be handed a bare photo in a carousel
    // whose other slides carry text.
    expect(composePersistedPosition).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'a', position: 0 })
    )
    vi.useRealTimers()
  })

  it('leaves a picture somebody already flattened alone', async () => {
    vi.useFakeTimers()
    loadPostCanvas.mockResolvedValue({ identity: { palette: {} }, docs: new Map() })
    const { result } = renderHook(() => useGenerateVisuals(() => {}))

    act(() => result.current.noteInFlight(POST_A, [0]))
    fetchVisualProgress.mockResolvedValue({
      ok: true,
      data: [
        {
          postId: 'a',
          images: [{ ...mappedImage('a', 0), fileName: 'slide-0.jpg' }],
          generatingPositions: [],
        },
      ],
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })

    expect(composePersistedPosition).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('stops asking about a post that is gone', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useGenerateVisuals(() => {}))

    act(() => result.current.noteInFlight(POST_A, [0]))
    // The post was deleted — here or in another tab — so the read answers for nobody. Without
    // settling it the loop would outlive the post and ask every five seconds forever.
    fetchVisualProgress.mockResolvedValue({ ok: true, data: [] })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    const asked = fetchVisualProgress.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(fetchVisualProgress).toHaveBeenCalledTimes(asked)
    expect(result.current.slotsFor(POST_A, [])).toEqual([])
    vi.useRealTimers()
  })

  it('shows a position claimed elsewhere as generating on the calendar too', () => {
    const { result } = renderHook(() => useGenerateVisuals(() => {}))

    act(() => result.current.noteInFlight(POST_A, [1]))

    // `positionsFor` is what the calendar card reads; `slotsFor` what the queue reads. A slot the
    // server is already painting must not be offered a Generate button on one of them.
    expect(result.current.positionsFor('a').generating).toEqual([1])
  })

  it('never asks while nothing is being made elsewhere', async () => {
    vi.useFakeTimers()
    renderHook(() => useGenerateVisuals(() => {}))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(fetchVisualProgress).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('useGenerateVisuals — per post', () => {
  it('tracks two posts at once and reports each landed image under its own post', async () => {
    const { fetchMock, land, visualRequests } = deferredFetch()
    vi.stubGlobal('fetch', fetchMock)
    const landed: Array<[string, PostImage]> = []
    const { result } = renderHook(() =>
      useGenerateVisuals((postId, image) => landed.push([postId, image]))
    )

    act(() => {
      void result.current.generate(POST_A, [0])
      void result.current.generate(POST_B, [0])
    })
    await waitFor(() => expect(visualRequests()).toHaveLength(2))
    expect(result.current.positionsFor('a').generating).toEqual([0])
    expect(result.current.positionsFor('b').generating).toEqual([0])

    await act(async () => {
      land('b', 0)
    })
    await waitFor(() => expect(result.current.positionsFor('b').generating).toEqual([]))
    expect(landed).toEqual([
      ['b', expect.objectContaining({ position: 0, publicUrl: 'https://cdn/b/0.jpg' })],
    ])
    // A is still waiting on its picture — B landing changed nothing about it.
    expect(result.current.positionsFor('a').generating).toEqual([0])
  })

  it("cancelling one post drops its work and leaves the other's alone", async () => {
    const { fetchMock, land, visualRequests } = deferredFetch()
    vi.stubGlobal('fetch', fetchMock)
    const landed: string[] = []
    const { result } = renderHook(() => useGenerateVisuals((postId) => landed.push(postId)))

    act(() => {
      void result.current.generate(POST_A, [0])
      void result.current.generate(POST_B, [0])
    })
    await waitFor(() => expect(visualRequests()).toHaveLength(2))
    act(() => result.current.cancel('a'))
    expect(result.current.positionsFor('a').generating).toEqual([])

    await act(async () => {
      land('b', 0)
    })
    await waitFor(() => expect(landed).toEqual(['b']))
  })

  it('a failed picture marks its slot for Retry; a refusal is said once, in the server’s words', async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({
        ok: false,
        status: url.includes('/a/') ? 500 : 402,
        json: () =>
          Promise.resolve({ error: url.includes('/a/') ? 'boom' : 'All 120 images used' }),
      } as unknown as Response)
    )
    vi.stubGlobal('fetch', fetchMock)
    const { toast } = await import('sonner')
    const { result } = renderHook(() => useGenerateVisuals(() => {}))

    await act(async () => {
      await result.current.generate(POST_A, [0])
      await result.current.generate(POST_B, [0, 1])
    })

    expect(result.current.slotsFor(POST_A, [])).toEqual([{ position: 0, status: 'error' }])
    expect(
      result.current.slotsFor(
        {
          ...POST_B,
          post_type: 'carousel',
          slides_json: [
            { headline: 'A', body: '' },
            { headline: 'B', body: '' },
          ],
        },
        []
      )
    ).toEqual([
      { position: 0, status: 'error' },
      { position: 1, status: 'error' },
    ])
    expect(toast.error).toHaveBeenCalledWith('All 120 images used', { id: 'visuals-refused' })
    expect(toast.error).toHaveBeenCalledWith('1 visual failed to generate')
  })

  it('a replaced image lands under its post and is composed like any other picture', async () => {
    const landed: Array<[string, PostImage]> = []
    const { result } = renderHook(() =>
      useGenerateVisuals((postId, image) => landed.push([postId, image]))
    )

    let ok = false
    await act(async () => {
      ok = await result.current.replaceImage(POST_A, 2, new File(['x'], 'mine.jpg'))
    })

    expect(ok).toBe(true)
    expect(landed).toEqual([
      ['a', expect.objectContaining({ position: 2, fileName: 'upload.jpg' })],
    ])
    // The bake goes through the same step a generated picture does — here it is a no-op, because
    // the mocked canvas read answers null, which is how a slide with no text keeps the upload.
    expect(composePersistedPosition).toHaveBeenCalledTimes(0)
    await waitFor(() => expect(result.current.positionsFor('a').composing).toEqual([]))
  })
})

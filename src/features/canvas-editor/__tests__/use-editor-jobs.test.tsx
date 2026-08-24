import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useEditorJobs } from '../hooks/use-editor-jobs'

/**
 * The registry every wait reports into.
 *
 * Its two jobs are to answer "is this kind running" once — that fact used to have eight separate
 * booleans, and the tray needed a ninth — and to let a result be thrown away mid-flight. Discarding
 * is deliberately NOT cancelling: the model finishes wherever it is running, so what the registry
 * guarantees is only that a discarded op declines to commit what comes back.
 */

const REPAIR = { kind: 'repair', label: 'Repair a zone', slide: 1, typicalSeconds: 45 } as const

describe('running', () => {
  it('reports a kind as running between start and finish', () => {
    const { result } = renderHook(() => useEditorJobs())
    expect(result.current.running('repair')).toBe(false)

    let handle!: ReturnType<typeof result.current.start>
    act(() => {
      handle = result.current.start(REPAIR)
    })
    expect(result.current.running('repair')).toBe(true)
    // Kinds are independent: a repair running must not disable the eraser.
    expect(result.current.running('erase')).toBe(false)

    act(() => handle.finish())
    expect(result.current.running('repair')).toBe(false)
  })

  it('keeps every running job in the list, with what the tray needs to draw it', () => {
    const { result } = renderHook(() => useEditorJobs())
    act(() => {
      result.current.start(REPAIR)
      result.current.start({ ...REPAIR, kind: 'expand', label: 'Expand the picture', slide: 3 })
    })
    expect(result.current.jobs).toHaveLength(2)
    expect(result.current.jobs[1]).toMatchObject({ label: 'Expand the picture', slide: 3 })
    expect(result.current.jobs[0]!.startedAt).toBeLessThanOrEqual(Date.now())
  })

  it('gives concurrent jobs distinct ids', () => {
    const { result } = renderHook(() => useEditorJobs())
    let a!: string
    let b!: string
    act(() => {
      a = result.current.start(REPAIR).id
      b = result.current.start(REPAIR).id
    })
    expect(a).not.toBe(b)
  })
})

describe('discarding', () => {
  it('tells the op it was discarded, synchronously', () => {
    const { result } = renderHook(() => useEditorJobs())
    let handle!: ReturnType<typeof result.current.start>
    act(() => {
      handle = result.current.start(REPAIR)
    })
    expect(handle.discarded()).toBe(false)

    act(() => result.current.discard(handle.id))
    // Read from inside an async closure that cannot see a later render — hence a ref, not state.
    expect(handle.discarded()).toBe(true)
  })

  it('takes the row away at once, without waiting for the work to end', () => {
    const { result } = renderHook(() => useEditorJobs())
    let handle!: ReturnType<typeof result.current.start>
    act(() => {
      handle = result.current.start(REPAIR)
    })
    act(() => result.current.discard(handle.id))
    expect(result.current.jobs).toHaveLength(0)
    // Leaving it counting up would be the editor arguing with a decision already made.
    expect(result.current.running('repair')).toBe(false)
    // Still true afterwards: the op is in flight and has yet to check.
    expect(handle.discarded()).toBe(true)
  })

  it('abandons the request where the op can abandon one', () => {
    const { result } = renderHook(() => useEditorJobs())
    const onDiscard = vi.fn()
    let handle!: ReturnType<typeof result.current.start>
    act(() => {
      handle = result.current.start({ ...REPAIR, kind: 'generate', onDiscard })
    })
    act(() => result.current.discard(handle.id))
    expect(onDiscard).toHaveBeenCalledOnce()
  })

  it('does not mark a later job with a finished job’s id', () => {
    const { result } = renderHook(() => useEditorJobs())
    let first!: ReturnType<typeof result.current.start>
    act(() => {
      first = result.current.start(REPAIR)
    })
    act(() => result.current.discard(first.id))
    act(() => first.finish())

    let second!: ReturnType<typeof result.current.start>
    act(() => {
      second = result.current.start(REPAIR)
    })
    // A recycled id would silently throw away the next result the user asked for.
    expect(second.discarded()).toBe(false)
  })
})

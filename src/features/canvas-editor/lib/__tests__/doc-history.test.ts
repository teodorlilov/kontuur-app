import { describe, expect, it } from 'vitest'
import type { CanvasDoc } from '@/types/canvas'
import { UNDO_CAP, commitHistory, initHistory, redoHistory, undoHistory } from '../doc-history'

function doc(overrides: Partial<CanvasDoc> = {}): CanvasDoc {
  return {
    version: 2,
    canvas: { w: 1080, h: 1350 },
    background: { publicUrl: 'https://example.test/a.jpg', storagePath: 'client/post/a.jpg' },
    flattenedStoragePath: null,
    scrim: { enabled: false, color: '#000000', opacity: 0.4, mode: 'bottom' },
    nodes: [],
    ...overrides,
  }
}

const setScrimOpacity = (opacity: number) => (current: CanvasDoc) => ({
  ...current,
  scrim: { ...current.scrim, opacity },
})

describe('commitHistory', () => {
  it('records a changed doc as one undo step', () => {
    const history = commitHistory(initHistory(doc()), setScrimOpacity(0.7))
    expect(history.past).toHaveLength(1)
    expect(history.present?.scrim.opacity).toBe(0.7)
  })

  it('ignores a mutation that returns the doc unchanged by reference', () => {
    const start = initHistory(doc())
    expect(commitHistory(start, (current) => current)).toBe(start)
  })

  it('ignores a mutation that rebuilds a structurally identical doc', () => {
    const start = initHistory(doc())
    // The Delete-key path used to burn a step this way: a fresh object with the same contents.
    expect(commitHistory(start, (current) => ({ ...current, nodes: [...current.nodes] }))).toBe(
      start
    )
  })

  it('folds commits sharing a coalesce key inside the window into one step', () => {
    let history = initHistory(doc())
    history = commitHistory(history, setScrimOpacity(0.5), { coalesceKey: 'scrim', now: 1000 })
    history = commitHistory(history, setScrimOpacity(0.6), { coalesceKey: 'scrim', now: 1200 })
    history = commitHistory(history, setScrimOpacity(0.7), { coalesceKey: 'scrim', now: 1400 })
    expect(history.past).toHaveLength(1)
    expect(history.present?.scrim.opacity).toBe(0.7)
    expect(undoHistory(history).present?.scrim.opacity).toBe(0.4)
  })

  it('starts a new step once the coalesce window lapses', () => {
    let history = initHistory(doc())
    history = commitHistory(history, setScrimOpacity(0.5), { coalesceKey: 'scrim', now: 1000 })
    history = commitHistory(history, setScrimOpacity(0.6), { coalesceKey: 'scrim', now: 3000 })
    expect(history.past).toHaveLength(2)
  })

  it('starts a new step when the coalesce key changes', () => {
    let history = initHistory(doc())
    history = commitHistory(history, setScrimOpacity(0.5), { coalesceKey: 'scrim', now: 1000 })
    history = commitHistory(history, setScrimOpacity(0.6), { coalesceKey: 'zoom', now: 1100 })
    expect(history.past).toHaveLength(2)
  })

  it('does not fold unkeyed commits', () => {
    let history = initHistory(doc())
    history = commitHistory(history, setScrimOpacity(0.5), { now: 1000 })
    history = commitHistory(history, setScrimOpacity(0.6), { now: 1010 })
    expect(history.past).toHaveLength(2)
  })

  it('clears the redo stack', () => {
    let history = commitHistory(initHistory(doc()), setScrimOpacity(0.7))
    history = undoHistory(history)
    expect(history.future).toHaveLength(1)
    history = commitHistory(history, setScrimOpacity(0.2))
    expect(history.future).toEqual([])
  })

  it('caps the undo stack', () => {
    let history = initHistory(doc())
    for (let step = 1; step <= UNDO_CAP + 10; step += 1) {
      history = commitHistory(history, setScrimOpacity(step / 100))
    }
    expect(history.past).toHaveLength(UNDO_CAP)
  })
})

describe('undoHistory / redoHistory', () => {
  it('round-trips a commit', () => {
    const start = initHistory(doc())
    const committed = commitHistory(start, setScrimOpacity(0.9))
    const undone = undoHistory(committed)
    expect(undone.present).toBe(start.present)
    expect(redoHistory(undone).present?.scrim.opacity).toBe(0.9)
  })

  it('is a no-op at either end of the stack', () => {
    const start = initHistory(doc())
    expect(undoHistory(start)).toBe(start)
    expect(redoHistory(start)).toBe(start)
  })

  it('ends the current coalesce run so the next commit stacks', () => {
    let history = initHistory(doc())
    history = commitHistory(history, setScrimOpacity(0.5), { coalesceKey: 'scrim', now: 1000 })
    history = redoHistory(undoHistory(history))
    history = commitHistory(history, setScrimOpacity(0.6), { coalesceKey: 'scrim', now: 1100 })
    expect(history.past).toHaveLength(2)
  })
})

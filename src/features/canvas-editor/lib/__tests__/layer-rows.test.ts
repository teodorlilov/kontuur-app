import { describe, expect, it } from 'vitest'
import { reorderNodeInDoc } from '@/lib/canvas/doc-nodes'
import type { CanvasDoc, CanvasTextNode } from '@/types/canvas'
import { docIndexForRow, layerRows, slotForRowStep } from '../layer-rows'

function node(id: string): CanvasTextNode {
  return {
    id,
    kind: 'text',
    role: 'custom',
    text: id,
    x: 0,
    y: 0,
    width: 400,
    fontFamily: 'Inter',
    fontSize: 40,
    fontWeight: 400,
    fill: '#ffffff',
    align: 'left',
    lineHeight: 1.2,
  }
}

/** Bottom-first in the doc: a is the backmost, d the frontmost. */
function doc(ids = ['a', 'b', 'c', 'd']): CanvasDoc {
  return {
    version: 2,
    canvas: { w: 1080, h: 1350 },
    background: { publicUrl: 'https://x.test/bg.jpg', storagePath: 'c/p/bg.jpg' },
    flattenedStoragePath: null,
    backdrop: { enabled: false, color: '#000000', opacity: 0.4 },
    nodes: ids.map(node),
  }
}

/** What the panel would show after dropping `id` into display gap `slot`. */
function afterDrop(id: string, slot: number, from = doc()): string[] {
  const moved = reorderNodeInDoc(from, id, docIndexForRow(from, id, slot))
  return layerRows(moved).map((entry) => entry.id)
}

describe('layerRows', () => {
  it('shows the doc topmost first', () => {
    expect(layerRows(doc()).map((entry) => entry.id)).toEqual(['d', 'c', 'b', 'a'])
  })

  it('does not mutate the doc it reverses', () => {
    const before = doc()
    layerRows(before)
    expect(before.nodes.map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('docIndexForRow', () => {
  // Display is [d, c, b, a]; gaps are 0 (above d) … 4 (below a).
  it('drops a row onto the very top', () => {
    expect(afterDrop('a', 0)).toEqual(['a', 'd', 'c', 'b'])
  })

  it('drops a row onto the very bottom', () => {
    expect(afterDrop('d', 4)).toEqual(['c', 'b', 'a', 'd'])
  })

  // This is the direction the plan's `len - 1 - displayIndex` formula got wrong: moving a row DOWN
  // the displayed list means the node is lifted from BELOW the insertion point, so every position
  // after it shifts by one.
  it('moves a row down the list by one', () => {
    expect(afterDrop('d', 2)).toEqual(['c', 'd', 'b', 'a'])
  })

  it('moves a row down the list by two', () => {
    expect(afterDrop('d', 3)).toEqual(['c', 'b', 'd', 'a'])
  })

  // 'a' is the bottom row (display index 3), so the gaps that surround it are 3 and 4 — moving it
  // up by one means the gap ABOVE the row above it, gap 2.
  it('moves a row up the list by one', () => {
    expect(afterDrop('a', 2)).toEqual(['d', 'c', 'a', 'b'])
  })

  it('moves a row up the list by two', () => {
    expect(afterDrop('a', 1)).toEqual(['d', 'a', 'c', 'b'])
  })

  it('treats both gaps around a row as no-ops for that row', () => {
    // Dropping 'c' just above or just below itself must leave the order alone.
    expect(afterDrop('c', 1)).toEqual(['d', 'c', 'b', 'a'])
    expect(afterDrop('c', 2)).toEqual(['d', 'c', 'b', 'a'])
    expect(afterDrop('a', 3)).toEqual(['d', 'c', 'b', 'a'])
    expect(afterDrop('a', 4)).toEqual(['d', 'c', 'b', 'a'])
  })

  it('returns the same doc object for a no-op, so no undo step is burned', () => {
    const before = doc()
    expect(reorderNodeInDoc(before, 'c', docIndexForRow(before, 'c', 1))).toBe(before)
    expect(reorderNodeInDoc(before, 'd', docIndexForRow(before, 'd', 0))).toBe(before)
    expect(reorderNodeInDoc(before, 'a', docIndexForRow(before, 'a', 4))).toBe(before)
  })

  it('round-trips: every gap maps to a reachable order, and none loses a node', () => {
    for (const id of ['a', 'b', 'c', 'd']) {
      for (let slot = 0; slot <= 4; slot++) {
        expect(afterDrop(id, slot).sort()).toEqual(['a', 'b', 'c', 'd'])
      }
    }
  })

  it('handles a single-node doc without producing an out-of-range index', () => {
    const one = doc(['solo'])
    expect(afterDrop('solo', 0, one)).toEqual(['solo'])
    expect(afterDrop('solo', 1, one)).toEqual(['solo'])
  })
})

describe('slotForRowStep — the ⌥↑/⌥↓ keyboard reorder', () => {
  /** What the panel would show after stepping the row at `index` one place. */
  function afterStep(index: number, direction: 'up' | 'down'): string[] {
    const from = doc()
    const id = layerRows(from)[index]!.id
    const moved = reorderNodeInDoc(
      from,
      id,
      docIndexForRow(from, id, slotForRowStep(index, direction))
    )
    return layerRows(moved).map((entry) => entry.id)
  }

  it('steps a row up one place', () => {
    // Display [d,c,b,a]; 'b' is index 2.
    expect(afterStep(2, 'up')).toEqual(['d', 'b', 'c', 'a'])
  })

  it('steps a row down one place', () => {
    // 'c' is index 1.
    expect(afterStep(1, 'down')).toEqual(['d', 'b', 'c', 'a'])
  })

  it('is a no-op at the top and the bottom rather than wrapping or dropping the node', () => {
    expect(afterStep(0, 'up')).toEqual(['d', 'c', 'b', 'a'])
    expect(afterStep(3, 'down')).toEqual(['d', 'c', 'b', 'a'])
  })

  it('returns the same doc at the ends, so a held key burns no undo steps', () => {
    const from = doc()
    const top = layerRows(from)[0]!.id
    expect(reorderNodeInDoc(from, top, docIndexForRow(from, top, slotForRowStep(0, 'up')))).toBe(
      from
    )
    const bottom = layerRows(from)[3]!.id
    expect(
      reorderNodeInDoc(from, bottom, docIndexForRow(from, bottom, slotForRowStep(3, 'down')))
    ).toBe(from)
  })

  it('walks a row from bottom to top one step at a time and back again', () => {
    let current = doc()
    const id = 'a'
    for (let step = 0; step < 3; step++) {
      const index = layerRows(current).findIndex((node) => node.id === id)
      current = reorderNodeInDoc(
        current,
        id,
        docIndexForRow(current, id, slotForRowStep(index, 'up'))
      )
    }
    expect(layerRows(current).map((node) => node.id)).toEqual(['a', 'd', 'c', 'b'])
    for (let step = 0; step < 3; step++) {
      const index = layerRows(current).findIndex((node) => node.id === id)
      current = reorderNodeInDoc(
        current,
        id,
        docIndexForRow(current, id, slotForRowStep(index, 'down'))
      )
    }
    expect(layerRows(current).map((node) => node.id)).toEqual(['d', 'c', 'b', 'a'])
  })
})

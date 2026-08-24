import { describe, expect, it } from 'vitest'
import type { CanvasDoc, CanvasImageNode, CanvasTextNode } from '@/types/canvas'
import {
  addNodeToDoc,
  grabbableIds,
  duplicateNodeInDoc,
  duplicateNodesInDoc,
  findNode,
  moveNodeInDoc,
  nudgeNodesInDoc,
  placeNodesInDoc,
  removeNodesFromDoc,
  reorderNodeInDoc,
  textNodes,
  unlockedIds,
  updateNodeInDoc,
  visibleNodes,
} from '../doc-nodes'

function text(id: string, x = 100, y = 200): CanvasTextNode {
  return {
    id,
    kind: 'text',
    role: 'custom',
    text: id,
    x,
    y,
    width: 600,
    fontFamily: 'Inter',
    fontSize: 48,
    fontWeight: 600,
    fill: '#ffffff',
    align: 'left',
    lineHeight: 1.2,
  }
}

function asset(id: string, x = 10, y = 20): CanvasImageNode {
  return {
    id,
    kind: 'image',
    src: { publicUrl: `https://example.test/${id}.png`, storagePath: `client/post/${id}.png` },
    x,
    y,
    width: 300,
    height: 300,
  }
}

// Deliberately interleaved: v2's whole point is that a picture can sit between two text layers.
function doc(overrides: Partial<CanvasDoc> = {}): CanvasDoc {
  return {
    version: 2,
    canvas: { w: 1080, h: 1350 },
    background: { publicUrl: 'https://example.test/bg.jpg', storagePath: 'client/post/bg.jpg' },
    flattenedStoragePath: null,
    backdrop: { enabled: false, color: '#000000', opacity: 0.4 },
    nodes: [asset('e1'), text('t1'), asset('e2'), text('t2')],
    ...overrides,
  }
}

const ids = (value: CanvasDoc) => value.nodes.map((node) => node.id)

describe('node lookup', () => {
  it('finds a node by id and reports unknown ones', () => {
    expect(findNode(doc(), 't1')?.kind).toBe('text')
    expect(findNode(doc(), 'e1')?.kind).toBe('image')
    expect(findNode(doc(), 'nope')).toBeNull()
  })

  it('splits the list by kind while keeping render order', () => {
    expect(textNodes(doc()).map((node) => node.id)).toEqual(['t1', 't2'])
  })
})

describe('addNodeToDoc', () => {
  it('appends at the top of the stack', () => {
    expect(ids(addNodeToDoc(doc(), text('new')))).toEqual(['e1', 't1', 'e2', 't2', 'new'])
  })
})

describe('updateNodeInDoc', () => {
  it('patches one node in place, leaving order and siblings alone', () => {
    const after = updateNodeInDoc<CanvasTextNode>(doc(), 't1', { text: 'changed' })
    expect(ids(after)).toEqual(ids(doc()))
    expect(after.nodes[1]).toMatchObject({ id: 't1', text: 'changed' })
    expect(after.nodes[0]).toEqual(doc().nodes[0])
  })

  it('returns the same doc for an unknown id, so no undo step is burned', () => {
    const before = doc()
    expect(updateNodeInDoc<CanvasTextNode>(before, 'nope', { text: 'x' })).toBe(before)
  })
})

describe('removeNodesFromDoc', () => {
  it('removes across kinds in one step', () => {
    expect(ids(removeNodesFromDoc(doc(), ['t1', 'e2']))).toEqual(['e1', 't2'])
  })

  it('removes a picture — the keyboard-delete path elements used to miss', () => {
    expect(ids(removeNodesFromDoc(doc(), ['e1']))).toEqual(['t1', 'e2', 't2'])
  })

  it('returns the same doc when a batch removal matches nothing', () => {
    const before = doc()
    expect(removeNodesFromDoc(before, ['nope'])).toBe(before)
  })
})

describe('duplicateNodeInDoc', () => {
  it('places the copy directly above its original with a visible offset', () => {
    const result = duplicateNodeInDoc(doc(), 't1', 'copy')
    expect(ids(result!.doc)).toEqual(['e1', 't1', 'copy', 'e2', 't2'])
    expect(result!.doc.nodes[2]).toMatchObject({ id: 'copy', x: 116, y: 216, text: 't1' })
  })

  it('duplicates pictures too', () => {
    expect(ids(duplicateNodeInDoc(doc(), 'e2', 'copy')!.doc)).toEqual([
      'e1',
      't1',
      'e2',
      'copy',
      't2',
    ])
  })

  it('returns null for an unknown id', () => {
    expect(duplicateNodeInDoc(doc(), 'nope', 'copy')).toBeNull()
  })

  it('duplicates a selection and reports the new ids', () => {
    const result = duplicateNodesInDoc(
      doc(),
      new Map([
        ['t1', 'copy-t1'],
        ['e1', 'copy-e1'],
      ])
    )
    expect(result.ids).toEqual(['copy-t1', 'copy-e1'])
    expect(ids(result.doc)).toEqual(['e1', 'copy-e1', 't1', 'copy-t1', 'e2', 't2'])
  })

  it('skips unknown ids when duplicating', () => {
    const result = duplicateNodesInDoc(doc(), new Map([['nope', 'copy']]))
    expect(result.ids).toEqual([])
    expect(ids(result.doc)).toEqual(ids(doc()))
  })
})

describe('moving a selection', () => {
  it('nudges a whole selection by the same delta', () => {
    const after = nudgeNodesInDoc(doc(), ['t1', 'e1'], 5, -5)
    expect(after.nodes[0]).toMatchObject({ id: 'e1', x: 15, y: 15 })
    expect(after.nodes[1]).toMatchObject({ id: 't1', x: 105, y: 195 })
    expect(after.nodes[2]).toEqual(doc().nodes[2])
  })

  it('returns the same doc for a zero nudge or an empty selection', () => {
    const before = doc()
    expect(nudgeNodesInDoc(before, ['t1'], 0, 0)).toBe(before)
    expect(nudgeNodesInDoc(before, [], 5, 5)).toBe(before)
    expect(nudgeNodesInDoc(before, ['nope'], 5, 5)).toBe(before)
  })

  it('places each dragged node at its own final position', () => {
    const after = placeNodesInDoc(doc(), [
      { id: 't1', x: 1, y: 2 },
      { id: 'e2', x: 3, y: 4 },
    ])
    expect(after.nodes[1]).toMatchObject({ id: 't1', x: 1, y: 2 })
    expect(after.nodes[2]).toMatchObject({ id: 'e2', x: 3, y: 4 })
  })

  it('returns the same doc when every placement is already where it lands', () => {
    const before = doc()
    expect(placeNodesInDoc(before, [{ id: 't1', x: 100, y: 200 }])).toBe(before)
  })
})

describe('moveNodeInDoc', () => {
  it('steps one position up or down', () => {
    expect(ids(moveNodeInDoc(doc(), 'e1', 'up'))).toEqual(['t1', 'e1', 'e2', 't2'])
    expect(ids(moveNodeInDoc(doc(), 't2', 'down'))).toEqual(['e1', 't1', 't2', 'e2'])
  })

  it('crosses kinds freely — a picture can move past text, which v1 could not do', () => {
    // e1 starts at the very bottom; three steps up put it above t1 and e2.
    let moved = moveNodeInDoc(doc(), 'e1', 'up')
    moved = moveNodeInDoc(moved, 'e1', 'up')
    expect(ids(moved)).toEqual(['t1', 'e2', 'e1', 't2'])
  })

  it('jumps to the very front or back of the whole list', () => {
    expect(ids(moveNodeInDoc(doc(), 'e1', 'up', true))).toEqual(['t1', 'e2', 't2', 'e1'])
    expect(ids(moveNodeInDoc(doc(), 't2', 'down', true))).toEqual(['t2', 'e1', 't1', 'e2'])
  })

  it('returns the same doc at the ends of the list and for unknown ids', () => {
    const before = doc()
    expect(moveNodeInDoc(before, 't2', 'up')).toBe(before)
    expect(moveNodeInDoc(before, 'e1', 'down')).toBe(before)
    expect(moveNodeInDoc(before, 'e1', 'down', true)).toBe(before)
    expect(moveNodeInDoc(before, 'nope', 'up')).toBe(before)
  })
})

describe('hidden and locked', () => {
  const flagged = () =>
    doc({
      nodes: [
        { ...asset('e1'), hidden: true },
        text('t1'),
        { ...asset('e2'), locked: true },
        { ...text('t2'), hidden: true, locked: true },
      ],
    })

  it('visibleNodes drops hidden nodes and keeps render order', () => {
    expect(visibleNodes(flagged()).map((node) => node.id)).toEqual(['t1', 'e2'])
  })

  it('grabbableIds excludes both hidden and locked — neither belongs to a canvas gesture', () => {
    expect([...grabbableIds(flagged())]).toEqual(['t1'])
  })

  it('unlockedIds narrows a selection to what a destructive operation may touch', () => {
    expect(unlockedIds(flagged(), ['e1', 't1', 'e2', 't2'])).toEqual(['e1', 't1'])
  })

  it('reads the flags as tri-state — absent means off, never falsy-by-accident', () => {
    // An explicit `false` must behave exactly like an absent field.
    const explicit = doc({ nodes: [{ ...text('t1'), hidden: false, locked: false }] })
    expect(visibleNodes(explicit).map((node) => node.id)).toEqual(['t1'])
    expect([...grabbableIds(explicit)]).toEqual(['t1'])
  })

  it('textNodes stays flag-blind — auto-compose gates on its length', () => {
    // Narrowing it to visible-only would make a doc whose only text is hidden stop baking
    // server-side, silently.
    expect(textNodes(flagged()).map((node) => node.id)).toEqual(['t1', 't2'])
  })
})

describe('reorderNodeInDoc', () => {
  it('drops a node at an exact post-removal index', () => {
    expect(ids(reorderNodeInDoc(doc(), 'e1', 2))).toEqual(['t1', 'e2', 'e1', 't2'])
    expect(ids(reorderNodeInDoc(doc(), 't2', 0))).toEqual(['t2', 'e1', 't1', 'e2'])
  })

  it('returns the same doc when the node does not move', () => {
    const before = doc()
    expect(reorderNodeInDoc(before, 'e1', 0)).toBe(before)
    expect(reorderNodeInDoc(before, 'nope', 2)).toBe(before)
  })

  it('clamps out-of-range targets onto the ends rather than dropping the node', () => {
    expect(ids(reorderNodeInDoc(doc(), 'e1', 99))).toEqual(['t1', 'e2', 't2', 'e1'])
    expect(ids(reorderNodeInDoc(doc(), 't2', -5))).toEqual(['t2', 'e1', 't1', 'e2'])
  })

  it('truncates a fractional target, so a stray float cannot rebuild an identical doc', () => {
    const before = doc()
    // 0.7 truncates to 0, which is e1's own index — a no-op, and so the same reference.
    expect(reorderNodeInDoc(before, 'e1', 0.7)).toBe(before)
  })

  it('is what moveNodeInDoc now delegates to, so both agree at the ends', () => {
    const before = doc()
    expect(moveNodeInDoc(before, 'e1', 'down')).toBe(before)
    expect(ids(moveNodeInDoc(before, 'e1', 'up'))).toEqual(ids(reorderNodeInDoc(before, 'e1', 1)))
  })
})

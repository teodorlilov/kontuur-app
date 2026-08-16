import { describe, expect, it } from 'vitest'
import type { CanvasDoc, CanvasTextNode } from '@/types/canvas'
import { applyStyleToDoc } from '@/lib/canvas/apply-style'
import { takesStyle } from '../style-preview'

function text(id: string, role: CanvasTextNode['role'], over: Partial<CanvasTextNode> = {}): CanvasTextNode {
  return {
    id,
    kind: 'text',
    role,
    x: 80,
    y: 200,
    width: 900,
    text: id,
    fontFamily: 'Inter',
    fontSize: 64,
    fontWeight: 700,
    fill: '#111111',
    align: 'left',
    lineHeight: 1.1,
    ...over,
  }
}

function doc(nodes: CanvasDoc['nodes']): CanvasDoc {
  return {
    version: 2,
    canvas: { w: 1080, h: 1350 },
    background: { publicUrl: 'https://x.test/a.jpg', storagePath: 'c1/p1/a.jpg' },
    flattenedStoragePath: null,
    scrim: { enabled: false, color: '#000000', opacity: 0.4, mode: 'bottom' },
    nodes,
  }
}

describe('takesStyle', () => {
  it('is true for a slide with a roled text node', () => {
    expect(takesStyle(doc([text('h', 'headline')]))).toBe(true)
  })

  it('is false for a slide with no text at all', () => {
    expect(takesStyle(doc([]))).toBe(false)
  })

  it('is false when every text layer is one the user added themselves', () => {
    // `applyStyleToDoc` never touches a custom node, so such a slide would come back unchanged —
    // the panel disables the row rather than offering a tick that does nothing.
    expect(takesStyle(doc([text('a', 'custom'), text('b', 'custom')]))).toBe(false)
    const styled = applyStyleToDoc(doc([text('a', 'custom')]), doc([text('h', 'headline', { x: 5 })]))
    expect((styled.nodes[0] as CanvasTextNode).x).toBe(80)
  })
})

describe('why the source slide is excluded from its own apply', () => {
  it('applying a doc to itself moves a duplicated role onto the original', () => {
    // The panel filters the source out for exactly this reason: `applyStyleToDoc` matches the FIRST
    // node of a role, so a duplicated headline is not left alone — it is snapped onto the original.
    const original = text('h1', 'headline', { x: 80, y: 200 })
    const duplicate = text('h2', 'headline', { x: 100, y: 220 })
    const self = doc([original, duplicate])

    const applied = applyStyleToDoc(self, self)
    const movedCopy = applied.nodes[1] as CanvasTextNode

    expect(movedCopy.id).toBe('h2')
    expect(movedCopy.x).toBe(80)
    expect(movedCopy.y).toBe(200)
    // Its words survive — only the geometry was taken, which is what makes the bug quiet.
    expect(movedCopy.text).toBe('h2')
  })
})

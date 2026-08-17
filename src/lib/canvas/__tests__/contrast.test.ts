import { describe, expect, it } from 'vitest'
import type { CanvasDoc, CanvasTextNode } from '@/types/canvas'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants'
import {
  CONTRAST_FLOOR,
  backdropAt,
  bestFill,
  lowContrastLabels,
  recolourForBackdrop,
  type BackdropGrid,
} from '../contrast'

const INK = '#101010'
const SURFACE = '#FFFFFF'
const CANDIDATES = [INK, SURFACE]

/** A grid whose top half is the given colour and bottom half the other — the common hard case. */
function splitGrid(top: { r: number; g: number; b: number }, bottom: typeof top): BackdropGrid {
  const cols = 4
  const rows = 4
  const cells = Array.from({ length: cols * rows }, (_, i) => (i < cols * 2 ? top : bottom))
  return { cols, rows, cells, canvas: { w: CANVAS_WIDTH, h: CANVAS_HEIGHT } }
}

const WHITE = { r: 255, g: 255, b: 255 }
const BLACK = { r: 0, g: 0, b: 0 }

function textNode(over: Partial<CanvasTextNode> = {}): CanvasTextNode {
  return {
    id: 'n1',
    kind: 'text',
    role: 'headline',
    text: 'Five ways to grow',
    x: 96,
    y: 100,
    width: 888,
    fontFamily: 'Manrope',
    fontSize: 80,
    fontWeight: 700,
    fill: INK,
    align: 'left',
    lineHeight: 1.1,
    ...over,
  }
}

function doc(nodes: CanvasDoc['nodes']): CanvasDoc {
  return {
    version: 2,
    canvas: { w: CANVAS_WIDTH, h: CANVAS_HEIGHT },
    background: { publicUrl: 'https://example.test/a.jpg', storagePath: 'a.jpg' },
    flattenedStoragePath: null,
    scrim: { enabled: true, color: SURFACE, opacity: 0.35, mode: 'bottom' },
    nodes,
  }
}

describe('backdropAt', () => {
  it('samples the region under the box, not the whole picture', () => {
    // The point of measuring per node: a headline over pale sky and a body over dark art need
    // opposite answers, and one average for the image would give both the same wrong one.
    const grid = splitGrid(WHITE, BLACK)
    expect(backdropAt(grid, { x: 0, y: 0, width: CANVAS_WIDTH, height: 200 })).toEqual(WHITE)
    expect(
      backdropAt(grid, { x: 0, y: CANVAS_HEIGHT - 200, width: CANVAS_WIDTH, height: 200 })
    ).toEqual(BLACK)
  })

  it('reports nothing for a box entirely off-canvas', () => {
    const grid = splitGrid(WHITE, WHITE)
    expect(backdropAt(grid, { x: -900, y: 0, width: 100, height: 100 })).toBeNull()
  })

  it('clamps a box that only partly overlaps rather than reading out of bounds', () => {
    const grid = splitGrid(WHITE, BLACK)
    expect(backdropAt(grid, { x: -400, y: 0, width: 600, height: 100 })).toEqual(WHITE)
  })
})

describe('bestFill', () => {
  it('picks the candidate that contrasts most', () => {
    expect(bestFill(CANDIDATES, WHITE)?.fill).toBe(INK)
    expect(bestFill(CANDIDATES, BLACK)?.fill).toBe(SURFACE)
  })

  it('keeps the earliest candidate on a tie, so brand colours win over fallbacks', () => {
    const mid = { r: 119, g: 119, b: 119 }
    const first = bestFill(['#000000', '#000000'], mid)
    expect(first?.fill).toBe('#000000')
  })

  it('ignores unparseable candidates instead of throwing', () => {
    expect(bestFill(['not-a-colour', INK], WHITE)?.fill).toBe(INK)
    expect(bestFill(['not-a-colour'], WHITE)).toBeNull()
  })

  it('always finds a fix when black and white are in the list', () => {
    // Why the caller ends its candidates with #000000/#FFFFFF. Against a backdrop of luminance L,
    // black scores (L+0.05)/0.05 and white scores 1.05/(L+0.05); they cross at L≈0.179, where BOTH
    // read 4.58:1. So the better of the two is never worse than 4.58 for ANY backdrop — comfortably
    // above the floor. The palette cannot promise that (a client whose ink and surface are both
    // mid-tone defeats them together), which is exactly why the fallbacks exist.
    for (let v = 0; v <= 255; v += 5) {
      const backdrop = { r: v, g: v, b: v }
      const best = bestFill([...CANDIDATES, '#000000', '#FFFFFF'], backdrop)
      expect(best, `grey ${v}`).not.toBeNull()
      expect(best!.ratio, `grey ${v}`).toBeGreaterThan(CONTRAST_FLOOR)
    }
  })
})

describe('recolourForBackdrop', () => {
  it('repaints text the picture is swallowing', () => {
    // Dark ink on dark art — the case the user hit, where the type is technically present and
    // practically invisible in the exported JPEG.
    const before = doc([textNode({ fill: INK, y: 1200 })])
    const after = recolourForBackdrop(before, splitGrid(WHITE, BLACK), CANDIDATES)
    expect((after.nodes[0] as CanvasTextNode).fill).toBe(SURFACE)
  })

  it('leaves a slide the art already suits completely alone', () => {
    const before = doc([textNode({ fill: INK, y: 100 })])
    // Same reference back, so a no-op never lands as an undo step.
    expect(recolourForBackdrop(before, splitGrid(WHITE, BLACK), CANDIDATES)).toBe(before)
  })

  it('never touches a non-text node', () => {
    const before = doc([
      { id: 'r', kind: 'rect', x: 0, y: 1200, width: 100, height: 100, fill: INK },
    ])
    expect(recolourForBackdrop(before, splitGrid(WHITE, BLACK), CANDIDATES)).toBe(before)
  })

  it('leaves the fill alone when no candidate clears the floor', () => {
    // #555 defeats near-black ink at 3:1 (2.59). Painting the node the least-bad colour anyway
    // would hide the fact that the real fix is the scrim, the crop, or moving the text — so the
    // fill is kept and the layer is reported instead.
    const mid = { r: 85, g: 85, b: 85 }
    const before = doc([textNode({ fill: INK })])
    const after = recolourForBackdrop(before, splitGrid(mid, mid), [INK])
    expect(after).toBe(before)
    expect(lowContrastLabels(after, splitGrid(mid, mid))).toEqual(['Five ways to grow'])
  })

  it('does not repaint type the floor says is already readable', () => {
    // Near-black ink on a mid grey reads at 4.18:1. A stricter floor would churn slides that are
    // perfectly legible, which is why display type is held to 3:1 rather than 4.5:1.
    const mid = { r: 119, g: 119, b: 119 }
    const before = doc([textNode({ fill: INK })])
    expect(recolourForBackdrop(before, splitGrid(mid, mid), CANDIDATES)).toBe(before)
  })

  it('resolves each node against its own band', () => {
    const before = doc([
      textNode({ id: 'top', y: 100, fill: SURFACE }),
      textNode({ id: 'low', y: 1200, fill: INK }),
    ])
    const after = recolourForBackdrop(before, splitGrid(WHITE, BLACK), CANDIDATES)
    expect((after.nodes[0] as CanvasTextNode).fill).toBe(INK)
    expect((after.nodes[1] as CanvasTextNode).fill).toBe(SURFACE)
  })
})

describe('lowContrastLabels', () => {
  it('names the offending layer by its own words', () => {
    const grid = splitGrid(BLACK, BLACK)
    expect(lowContrastLabels(doc([textNode({ fill: INK })]), grid)).toEqual(['Five ways to grow'])
  })

  it('says nothing when everything clears the floor', () => {
    expect(lowContrastLabels(doc([textNode({ fill: INK })]), splitGrid(WHITE, WHITE))).toEqual([])
  })

  it('holds display type to the large-text threshold, not the body-copy one', () => {
    // 3:1, deliberately — everything a lockup places is display-sized, and the 4.5:1 small-print
    // figure would repaint slides that read perfectly well.
    expect(CONTRAST_FLOOR).toBe(3)
  })
})

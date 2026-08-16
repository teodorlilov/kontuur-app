import type { CanvasImageNode, CanvasShapeKind, CanvasShapeNode } from '@/types/canvas'

/** Friendly default width for a freshly placed asset — big enough to see, small enough to place. */
const DEFAULT_ASSET_WIDTH = 420

/**
 * Map a canvas-space point into an element's bitmap pixels: un-translate, un-rotate around the
 * top-left pivot, then scale display-size → natural-size (eraser strokes land where they were
 * painted even on rotated/scaled elements).
 */
export function canvasPointToElementLocal(
  point: { x: number; y: number },
  element: Pick<CanvasImageNode, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
  natural: { width: number; height: number }
): { x: number; y: number } {
  const radians = ((element.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = point.x - element.x
  const dy = point.y - element.y
  // Inverse rotation: transpose of the rotation matrix.
  const localX = cos * dx + sin * dy
  const localY = -sin * dx + cos * dy
  return {
    x: localX * (natural.width / element.width),
    y: localY * (natural.height / element.height),
  }
}

/** A new image node at an exact canvas rect — cutouts land pixel-perfect over their source spot. */
export function createNodeAtRect(
  src: CanvasImageNode['src'],
  rect: { x: number; y: number; width: number; height: number }
): CanvasImageNode {
  return { id: crypto.randomUUID(), kind: 'image', src, ...rect }
}

/** The box a freshly inserted node occupies: a friendly width, centred, at the given aspect. */
function centeredBox(
  width: number,
  height: number,
  canvas: { w: number; h: number }
): { x: number; y: number; width: number; height: number } {
  return { x: (canvas.w - width) / 2, y: (canvas.h - height) / 2, width, height }
}

/** Default extent of an inserted shape, as a share of the canvas width. */
const SHAPE_WIDTH_RATIO = 0.45
/** A line is a rule, not a box — its box height is just its ink. */
const LINE_STROKE_WIDTH = 6

/**
 * A new drawn primitive, centred, in the client's accent colour. Rect and ellipse arrive filled
 * (an outline-only shape reads as a mistake until you ask for it); a line arrives as a stroke,
 * because that is all a line is.
 */
export function createShapeNode(
  kind: CanvasShapeKind,
  canvas: { w: number; h: number },
  color: string
): CanvasShapeNode {
  const width = Math.round(canvas.w * SHAPE_WIDTH_RATIO)
  if (kind === 'line') {
    return {
      id: crypto.randomUUID(),
      kind,
      ...centeredBox(width, LINE_STROKE_WIDTH, canvas),
      stroke: color,
      strokeWidth: LINE_STROKE_WIDTH,
    }
  }
  return {
    id: crypto.randomUUID(),
    kind,
    ...centeredBox(width, width, canvas),
    fill: color,
  }
}

/** A new node centered on the canvas, scaled to a friendly width at the asset's natural aspect. */
export function createCenteredNode(
  kind: CanvasImageNode['kind'],
  src: CanvasImageNode['src'],
  natural: { width: number; height: number },
  canvas: { w: number; h: number }
): CanvasImageNode {
  const width = Math.min(DEFAULT_ASSET_WIDTH, canvas.w)
  const height = width * (natural.height / Math.max(1, natural.width))
  return { id: crypto.randomUUID(), kind, src, ...centeredBox(width, height, canvas) }
}

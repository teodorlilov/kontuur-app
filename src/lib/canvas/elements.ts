import type { CanvasElement } from '@/types/canvas'

/** Friendly default width for a freshly added element — big enough to see, small enough to place. */
const DEFAULT_ELEMENT_WIDTH = 420

/**
 * Map a canvas-space point into an element's bitmap pixels: un-translate, un-rotate around the
 * top-left pivot, then scale display-size → natural-size (eraser strokes land where they were
 * painted even on rotated/scaled elements).
 */
export function canvasPointToElementLocal(
  point: { x: number; y: number },
  element: Pick<CanvasElement, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
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

/** A new image element at an exact canvas rect — cutouts land pixel-perfect over their source spot. */
export function createElementAtRect(
  src: CanvasElement['src'],
  rect: { x: number; y: number; width: number; height: number }
): CanvasElement {
  return { id: crypto.randomUUID(), kind: 'image', src, ...rect }
}

/** A new element centered on the canvas, scaled to a friendly width at the asset's natural aspect. */
export function createCenteredElement(
  kind: CanvasElement['kind'],
  src: CanvasElement['src'],
  natural: { width: number; height: number },
  canvas: { w: number; h: number }
): CanvasElement {
  const width = Math.min(DEFAULT_ELEMENT_WIDTH, canvas.w)
  const height = width * (natural.height / Math.max(1, natural.width))
  return {
    id: crypto.randomUUID(),
    kind,
    src,
    x: (canvas.w - width) / 2,
    y: (canvas.h - height) / 2,
    width,
    height,
  }
}

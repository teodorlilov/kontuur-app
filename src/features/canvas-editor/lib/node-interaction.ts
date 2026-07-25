/** Shared stage-interaction helpers for text layers and elements (drag clamp, rotation persist). */

import { clamp } from '@/lib/canvas/clamp'

/** Keep at least this many canvas px of a dragged node inside the frame so it can't get lost. */
const DRAG_KEEP = 40

/** A Konva dragBoundFunc (screen space) that keeps a sliver of the node inside the canvas. */
export function dragBoundFor(
  size: { width: number },
  canvas: { w: number; h: number },
  stageScale: number
): (pos: { x: number; y: number }) => { x: number; y: number } {
  return (pos) => ({
    x: clamp(pos.x, (DRAG_KEEP - size.width) * stageScale, (canvas.w - DRAG_KEEP) * stageScale),
    y: clamp(pos.y, 0, (canvas.h - DRAG_KEEP) * stageScale),
  })
}

/** Round + clamp a transformer rotation to the doc schema's −180…180 range. */
export function persistedRotation(degrees: number): number {
  return clamp(Math.round(degrees), -180, 180)
}

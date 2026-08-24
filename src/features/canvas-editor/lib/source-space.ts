import type { CanvasBackgroundTransform, CanvasImageNode } from '@/types/canvas'
import { coverCrop, type CropAttrs } from '@/lib/canvas/cover-crop'
import { canvasPointToElementLocal } from '@/lib/canvas/elements'
import type { BrushStroke } from '../types'

/** The mapping from editor canvas space into background SOURCE pixels through the current crop. */
interface SourceSpace {
  crop: CropAttrs
  /** Source px per canvas px. */
  scale: number
}

/** Resolve the crop mapping for the current background + reposition transform. */
export function sourceSpaceFor(
  src: { width: number; height: number },
  canvas: { w: number; h: number },
  transform?: CanvasBackgroundTransform
): SourceSpace {
  const crop = coverCrop(src.width, src.height, canvas.w, canvas.h, transform)
  return { crop, scale: crop.cropWidth / canvas.w }
}

/** An offscreen canvas at the given dimensions with its 2D context. */
export function createDrawingCanvas(size: {
  width: number
  height: number
}): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(size.width))
  canvas.height = Math.max(1, Math.ceil(size.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  return [canvas, ctx]
}

/** Draw brush strokes (canvas space) into source space; the caller sets style/composite first. */
export function traceStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: BrushStroke[],
  space: SourceSpace
): void {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const stroke of strokes) {
    ctx.lineWidth = stroke.size * space.scale
    ctx.beginPath()
    for (let i = 0; i + 1 < stroke.points.length; i += 2) {
      const x = space.crop.cropX + stroke.points[i]! * space.scale
      const y = space.crop.cropY + stroke.points[i + 1]! * space.scale
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}

/**
 * Draw brush strokes (canvas space) into ONE ELEMENT's own pixels; the caller sets style/composite.
 *
 * The sibling of `traceStrokes` for the other coordinate space the editor paints in. Shared because
 * two tools now trace the same strokes onto the same element for opposite purposes — the eraser
 * cuts them out, the repair mask marks them editable — and a stroke that lands in one place for one
 * tool and another place for the other is worse than either being wrong on its own.
 */
export function traceStrokesInElement(
  ctx: CanvasRenderingContext2D,
  strokes: BrushStroke[],
  element: Pick<CanvasImageNode, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flipX' | 'flipY'>,
  natural: { width: number; height: number }
): void {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // Element px per canvas px. Uniform on width: a brush is round, and scaling its width on one axis
  // and its height on the other would make an oval on any non-uniformly-scaled picture.
  const scale = natural.width / element.width
  for (const stroke of strokes) {
    ctx.lineWidth = stroke.size * scale
    ctx.beginPath()
    for (let i = 0; i + 1 < stroke.points.length; i += 2) {
      const point = canvasPointToElementLocal(
        { x: stroke.points[i]!, y: stroke.points[i + 1]! },
        element,
        natural
      )
      if (i === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }
}

/** Element px per canvas px — the feather and brush scale for an element-space edit. */
export function elementScale(
  element: Pick<CanvasImageNode, 'width'>,
  natural: { width: number }
): number {
  return natural.width / element.width
}

/** Map a flat canvas-space point list (x,y pairs) into source pixels through the crop. */
export function mapPointsToSource(points: number[], space: SourceSpace): number[] {
  const mapped: number[] = []
  for (let i = 0; i + 1 < points.length; i += 2) {
    mapped.push(
      space.crop.cropX + points[i]! * space.scale,
      space.crop.cropY + points[i + 1]! * space.scale
    )
  }
  return mapped
}

/** Export a canvas as a Blob, rejecting when the browser produces none. */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export produced no blob'))),
      type,
      quality
    )
  })
}

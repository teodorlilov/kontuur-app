import type { CanvasBackgroundTransform } from '@/types/canvas'
import { coverCrop, type CropAttrs } from '@/lib/canvas/cover-crop'
import type { BrushStroke } from '../types'

/** The mapping from editor canvas space into background SOURCE pixels through the current crop. */
export interface SourceSpace {
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
export function createDrawingCanvas(size: { width: number; height: number }): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(size.width))
  canvas.height = Math.max(1, Math.ceil(size.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  return [canvas, ctx]
}

/** Draw brush strokes (canvas space) into source space; the caller sets style/composite first. */
export function traceStrokes(ctx: CanvasRenderingContext2D, strokes: BrushStroke[], space: SourceSpace): void {
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

/** Map a flat canvas-space point list (x,y pairs) into source pixels through the crop. */
export function mapPointsToSource(points: number[], space: SourceSpace): number[] {
  const mapped: number[] = []
  for (let i = 0; i + 1 < points.length; i += 2) {
    mapped.push(space.crop.cropX + points[i]! * space.scale, space.crop.cropY + points[i + 1]! * space.scale)
  }
  return mapped
}

/** Export a canvas as a Blob, rejecting when the browser produces none. */
export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas export produced no blob'))), type, quality)
  })
}

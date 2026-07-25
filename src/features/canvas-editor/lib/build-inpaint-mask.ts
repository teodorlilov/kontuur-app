import type { CanvasBackgroundTransform } from '@/types/canvas'
import type { BrushStroke } from '../types'
import { canvasToBlob, createDrawingCanvas, sourceSpaceFor, traceStrokes } from './source-space'

/** Feather width (canvas px, scaled to source) so composited fills blend, not paste. */
const FEATHER_CANVAS_PX = 6

/**
 * Rasterize brush strokes into the OpenAI edit-mask convention at SOURCE dimensions: fully
 * opaque everywhere EXCEPT the painted regions, which are punched transparent ("edit here").
 * Strokes map through the current crop, so painting respects the reposition and out-of-view
 * source pixels stay opaque (untouched).
 */
export async function buildInpaintMask(
  strokes: BrushStroke[],
  src: { width: number; height: number },
  canvas: { w: number; h: number },
  transform?: CanvasBackgroundTransform
): Promise<Blob> {
  const space = sourceSpaceFor(src, canvas, transform)
  const [mask, ctx] = createDrawingCanvas(src)
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, src.width, src.height)
  // Erase alpha under the strokes — transparent = the region the model may repaint.
  ctx.globalCompositeOperation = 'destination-out'
  ctx.strokeStyle = 'black'
  traceStrokes(ctx, strokes, space)
  return canvasToBlob(mask, 'image/png')
}

/**
 * Guarantee-the-mask composite: the edited result is blended in ONLY under the strokes (with a
 * feathered edge), original pixels everywhere else — gpt-image edits regenerate globally, so
 * pixel-perfect preservation outside the brush is enforced here, not trusted to the model.
 */
export async function compositeInpaintResult(
  original: HTMLImageElement,
  edited: HTMLImageElement,
  strokes: BrushStroke[],
  src: { width: number; height: number },
  canvas: { w: number; h: number },
  transform?: CanvasBackgroundTransform
): Promise<Blob> {
  const space = sourceSpaceFor(src, canvas, transform)

  // Edited-under-strokes layer: feathered stroke alpha, then keep the edit only where it is.
  const [overlay, overlayCtx] = createDrawingCanvas(src)
  overlayCtx.filter = `blur(${FEATHER_CANVAS_PX * space.scale}px)`
  overlayCtx.strokeStyle = 'black'
  traceStrokes(overlayCtx, strokes, space)
  overlayCtx.filter = 'none'
  overlayCtx.globalCompositeOperation = 'source-in'
  overlayCtx.drawImage(edited, 0, 0, src.width, src.height)

  const [result, resultCtx] = createDrawingCanvas(src)
  resultCtx.drawImage(original, 0, 0, src.width, src.height)
  resultCtx.drawImage(overlay, 0, 0)
  return canvasToBlob(result, 'image/jpeg', 0.92)
}

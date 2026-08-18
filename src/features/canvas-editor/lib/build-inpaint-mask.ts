import type { CanvasBackgroundTransform } from '@/types/canvas'
import type { PaddedFrame } from '@/lib/canvas/outpaint-geometry'
import type { BrushStroke } from '../types'
import { canvasToBlob, createDrawingCanvas, sourceSpaceFor, traceStrokes } from './source-space'

/** Feather width (canvas px, scaled to source) so composited fills blend, not paste. */
const FEATHER_CANVAS_PX = 6
/** Feather across an outpaint seam, in source px — wider, because it blends two whole regions. */
const SEAM_FEATHER_PX = 8
/**
 * How far the repaint region eats INTO the original across an outpaint seam. Without an overlap the
 * model is forbidden the boundary pixel itself and has nothing to blend against, so the new border
 * meets the old image at a hard line.
 */
const SEAM_OVERLAP_PX = 24

/**
 * The area of an image an edit is allowed to change.
 *
 * One abstraction because the mask and the composite must describe the SAME area — they did before
 * as two hand-matched calls to `traceStrokes`, and a change to one without the other would have put
 * the feather somewhere the model was never told it could paint.
 *
 * `cutout.ts` deliberately keeps its own rasterizers: those work in element-local pixels with a
 * different composite operation, so folding them in here would mean a region that has to know which
 * coordinate space it is in — the abstraction would carry the difference rather than remove it.
 */
interface EditRegion {
  /** Paint the editable area as an opaque shape. The caller owns composite op and filter. */
  paint: (ctx: CanvasRenderingContext2D) => void
  /** Blur radius for the composite's feathered edge, in the target image's own pixels. */
  featherPx: number
}

/** The region under a set of brush strokes, mapped through the current crop. */
export function strokeRegion(
  strokes: BrushStroke[],
  src: { width: number; height: number },
  canvas: { w: number; h: number },
  transform?: CanvasBackgroundTransform
): EditRegion {
  const space = sourceSpaceFor(src, canvas, transform)
  return {
    paint: (ctx) => {
      ctx.strokeStyle = 'black'
      traceStrokes(ctx, strokes, space)
    },
    featherPx: FEATHER_CANVAS_PX * space.scale,
  }
}

/** The border of a padded frame: everything outside the original, plus a little of its edge. */
export function borderRegion(frame: PaddedFrame): EditRegion {
  // The outer rectangle runs well past the image edge. If it stopped at the boundary the
  // composite's blur would fade the outermost pixels toward transparent, and every outpaint would
  // ship a smeared halo of half-applied filler around all four sides.
  const overshoot = SEAM_FEATHER_PX * 4
  const keep = {
    x: frame.left + SEAM_OVERLAP_PX,
    y: frame.top + SEAM_OVERLAP_PX,
    width: Math.max(1, frame.sourceWidth - SEAM_OVERLAP_PX * 2),
    height: Math.max(1, frame.sourceHeight - SEAM_OVERLAP_PX * 2),
  }
  return {
    paint: (ctx) => {
      ctx.fillStyle = 'black'
      ctx.beginPath()
      ctx.rect(-overshoot, -overshoot, frame.width + overshoot * 2, frame.height + overshoot * 2)
      ctx.rect(keep.x, keep.y, keep.width, keep.height)
      // evenodd turns the inner rect into a hole rather than a second filled box.
      ctx.fill('evenodd')
    },
    featherPx: SEAM_FEATHER_PX,
  }
}

/**
 * Rasterize a region into the OpenAI edit-mask convention: fully opaque everywhere EXCEPT the
 * region, which is punched transparent ("edit here").
 *
 * `size` must be the dimensions the model will be ASKED for. gpt-image-2 honours an on-grid request
 * exactly and floors an off-grid one, so a size that disagrees with the request shifts this mask
 * against the returned image — see `outpaint-geometry.ts`.
 */
export async function buildEditMask(
  size: { width: number; height: number },
  region: EditRegion
): Promise<Blob> {
  const [mask, ctx] = createDrawingCanvas(size)
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.globalCompositeOperation = 'destination-out'
  region.paint(ctx)
  return canvasToBlob(mask, 'image/png')
}

/**
 * Guarantee-the-region composite: the edited result is blended in ONLY inside the region (with a
 * feathered edge), original pixels everywhere else.
 *
 * This is load-bearing, not belt-and-braces: measured against the live model on 2026-08-16, the
 * area the mask marked KEEP still came back with a mean absolute channel difference of 3.1/255 and
 * a worst case of 78/255. gpt-image edits regenerate globally, so preservation is enforced here.
 *
 * Sources are `CanvasImageSource` rather than `HTMLImageElement` so an offscreen canvas — the
 * padded intermediate an outpaint builds — can pass without a round-trip through a Blob.
 */
export async function compositeEditedRegion(
  original: CanvasImageSource,
  edited: CanvasImageSource,
  size: { width: number; height: number },
  region: EditRegion
): Promise<Blob> {
  const [overlay, overlayCtx] = createDrawingCanvas(size)
  overlayCtx.filter = `blur(${region.featherPx}px)`
  region.paint(overlayCtx)
  overlayCtx.filter = 'none'
  overlayCtx.globalCompositeOperation = 'source-in'
  overlayCtx.drawImage(edited, 0, 0, size.width, size.height)

  const [result, resultCtx] = createDrawingCanvas(size)
  resultCtx.drawImage(original, 0, 0, size.width, size.height)
  resultCtx.drawImage(overlay, 0, 0)
  return canvasToBlob(result, 'image/jpeg', 0.92)
}

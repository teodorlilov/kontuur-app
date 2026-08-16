import type { CanvasBackgroundTransform, CanvasImageNode } from '@/types/canvas'
import { canvasPointToElementLocal } from '@/lib/canvas/elements'
import type { SourceRect } from '@/lib/canvas/reposition'
import type { BrushStroke } from '../types'
import { naturalSize } from './load-image'
import {
  canvasToBlob,
  createDrawingCanvas,
  mapPointsToSource,
  sourceSpaceFor,
} from './source-space'

/** Alpha above this counts as "object" when scanning for the trim box (0–255). */
const ALPHA_THRESHOLD = 8
/** Transparent padding kept around the trimmed cutout so soft matte edges survive the crop. */
const TRIM_PADDING = 4
/** Soft edge (canvas px, scaled to source) so lasso cuts blend instead of looking razor-cut. */
const LASSO_FEATHER_CANVAS_PX = 2
/** A lasso loop spanning less than this many canvas px is a stray click, not a selection. */
const MIN_LASSO_SPAN = 12
/** Drop loop points closer than this (canvas px) before smoothing — hand jitter, not shape. */
const LOOP_SIMPLIFY_MIN_DIST = 3
/** Sample the background colour at every Nth simplified loop point. */
const BOUNDARY_SAMPLE_STEP = 4
/** RGB distance under which a pixel counts as "background" during the cleanup key. */
const KEY_TOLERANCE = 42
/** If keying would erase this share of the region, the loop WAS the object — keep the plain cut. */
const KEY_SKIP_RATIO = 0.92

interface Trimmed {
  blob: Blob
  bbox: SourceRect
}

// Scan a canvas for its opaque bounding box and export the cropped PNG.
async function trimCanvas(source: HTMLCanvasElement): Promise<Trimmed | null> {
  const ctx = source.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  const { width, height } = source
  const { data } = ctx.getImageData(0, 0, width, height)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! > ALPHA_THRESHOLD) {
      const pixel = (i - 3) / 4
      const x = pixel % width
      const y = (pixel - x) / width
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (!Number.isFinite(minX)) return null

  const x = Math.max(0, minX - TRIM_PADDING)
  const y = Math.max(0, minY - TRIM_PADDING)
  const bbox: SourceRect = {
    x,
    y,
    width: Math.min(width, maxX + TRIM_PADDING) - x,
    height: Math.min(height, maxY + TRIM_PADDING) - y,
  }
  const [trimmed, trimmedCtx] = createDrawingCanvas(bbox)
  trimmedCtx.drawImage(
    source,
    bbox.x,
    bbox.y,
    bbox.width,
    bbox.height,
    0,
    0,
    bbox.width,
    bbox.height
  )
  return { blob: await canvasToBlob(trimmed, 'image/png'), bbox }
}

/**
 * Trim a transparent-PNG cutout to its opaque bounding box: the element then hugs the subject
 * (visible resize handles, precise dragging) instead of spanning the whole source image.
 * Returns the trimmed PNG plus the bbox in SOURCE pixels, or null for a fully transparent image.
 */
export async function trimTransparentEdges(image: HTMLImageElement): Promise<Trimmed | null> {
  const [canvas, ctx] = createDrawingCanvas(naturalSize(image))
  ctx.drawImage(image, 0, 0)
  return trimCanvas(canvas)
}

interface PointBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

// Bounding box of a flat x,y point list; null for an empty list.
function pointBounds(points: number[]): PointBounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i + 1 < points.length; i += 2) {
    minX = Math.min(minX, points[i]!)
    maxX = Math.max(maxX, points[i]!)
    minY = Math.min(minY, points[i + 1]!)
    maxY = Math.max(maxY, points[i + 1]!)
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null
}

// Decimate hand jitter, then one Chaikin corner-cutting pass — a calmer, rounder loop edge.
function smoothLoop(points: number[]): number[] {
  const kept: number[] = []
  let lastX = Infinity
  let lastY = Infinity
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i]!
    const y = points[i + 1]!
    if (Math.hypot(x - lastX, y - lastY) >= LOOP_SIMPLIFY_MIN_DIST) {
      kept.push(x, y)
      lastX = x
      lastY = y
    }
  }
  if (kept.length < 8) return points
  const out: number[] = []
  for (let i = 0; i + 1 < kept.length; i += 2) {
    const x1 = kept[i]!
    const y1 = kept[i + 1]!
    const x2 = kept[(i + 2) % kept.length]!
    const y2 = kept[(i + 3) % kept.length]!
    out.push(
      0.75 * x1 + 0.25 * x2,
      0.75 * y1 + 0.25 * y2,
      0.25 * x1 + 0.75 * x2,
      0.25 * y1 + 0.75 * y2
    )
  }
  return out
}

// The loop boundary IS background by definition — sample its colours (deduped) for the key.
function sampleBoundaryColors(
  ctx: CanvasRenderingContext2D,
  srcPoints: number[],
  src: { width: number; height: number }
): number[][] {
  const samples: number[][] = []
  for (let i = 0; i + 1 < srcPoints.length; i += 2 * BOUNDARY_SAMPLE_STEP) {
    const x = Math.min(src.width - 1, Math.max(0, Math.round(srcPoints[i]!)))
    const y = Math.min(src.height - 1, Math.max(0, Math.round(srcPoints[i + 1]!)))
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data
    const isNew = samples.every(
      (sample) => Math.hypot(sample[0]! - r!, sample[1]! - g!, sample[2]! - b!) > KEY_TOLERANCE / 2
    )
    if (isNew) samples.push([r!, g!, b!])
  }
  return samples
}

// Erase boundary-similar colours inside the cut region; bail out when the loop was the object.
function keyOutBackground(
  ctx: CanvasRenderingContext2D,
  bbox: SourceRect,
  samples: number[][]
): void {
  if (samples.length === 0) return
  const region = ctx.getImageData(
    bbox.x,
    bbox.y,
    Math.max(1, Math.ceil(bbox.width)),
    Math.max(1, Math.ceil(bbox.height))
  )
  const { data } = region
  const removable: number[] = []
  let opaque = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! <= ALPHA_THRESHOLD) continue
    opaque += 1
    const matches = samples.some(
      (sample) =>
        Math.hypot(sample[0]! - data[i]!, sample[1]! - data[i + 1]!, sample[2]! - data[i + 2]!) <=
        KEY_TOLERANCE
    )
    if (matches) removable.push(i)
  }
  if (opaque === 0 || removable.length / opaque > KEY_SKIP_RATIO) return
  for (const i of removable) data[i + 3] = 0
  ctx.putImageData(region, bbox.x, bbox.y)
}

function loopSourceBounds(srcPoints: number[], src: { width: number; height: number }): SourceRect {
  const bounds = pointBounds(srcPoints) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  const x = Math.max(0, bounds.minX)
  const y = Math.max(0, bounds.minY)
  return {
    x,
    y,
    width: Math.min(src.width, bounds.maxX) - x,
    height: Math.min(src.height, bounds.maxY) - y,
  }
}

interface LoopGeometry {
  srcPoints: number[]
  bounds: SourceRect
  /** Source px per canvas px (feather scaling). */
  scale: number
}

// Span guard + smoothing + crop mapping — shared by the geometric and AI-detect lasso paths.
function analyzeLoop(
  loopPoints: number[],
  src: { width: number; height: number },
  canvas: { w: number; h: number },
  transform?: CanvasBackgroundTransform
): LoopGeometry | null {
  const bounds = pointBounds(loopPoints)
  if (
    !bounds ||
    (bounds.maxX - bounds.minX < MIN_LASSO_SPAN && bounds.maxY - bounds.minY < MIN_LASSO_SPAN)
  ) {
    return null
  }
  const space = sourceSpaceFor(src, canvas, transform)
  const srcPoints = mapPointsToSource(smoothLoop(loopPoints), space)
  return { srcPoints, bounds: loopSourceBounds(srcPoints, src), scale: space.scale }
}

// The loop polygon as a feathered alpha shape, drawable at an offset (crop-local or full-source).
function loopShapeCanvas(
  size: { width: number; height: number },
  srcPoints: number[],
  offset: { x: number; y: number },
  blurPx: number
): HTMLCanvasElement {
  const [shape, ctx] = createDrawingCanvas(size)
  ctx.filter = `blur(${blurPx}px)`
  ctx.fillStyle = 'black'
  ctx.beginPath()
  for (let i = 0; i + 1 < srcPoints.length; i += 2) {
    if (i === 0) ctx.moveTo(srcPoints[i]! + offset.x, srcPoints[i + 1]! + offset.y)
    else ctx.lineTo(srcPoints[i]! + offset.x, srcPoints[i + 1]! + offset.y)
  }
  ctx.closePath()
  ctx.fill()
  return shape
}

/**
 * Manual lasso cutout: the background pixels enclosed by the drawn loop become a trimmed
 * transparent-PNG element. The loop is smoothed, and colours matching the loop BOUNDARY (which
 * is background by definition) are keyed out inside the region — on flat-ish backdrops the
 * object comes out alone. Pure geometry + one pixel pass; no model involved. Null when the loop
 * is a stray click or encloses nothing.
 */
export async function cutoutFromLasso(
  background: HTMLImageElement,
  loopPoints: number[],
  src: { width: number; height: number },
  canvas: { w: number; h: number },
  transform?: CanvasBackgroundTransform
): Promise<Trimmed | null> {
  const loop = analyzeLoop(loopPoints, src, canvas, transform)
  if (!loop) return null

  const shape = loopShapeCanvas(
    src,
    loop.srcPoints,
    { x: 0, y: 0 },
    LASSO_FEATHER_CANVAS_PX * loop.scale
  )
  const [cut, cutCtx] = createDrawingCanvas(src)
  cutCtx.drawImage(background, 0, 0, src.width, src.height)
  const boundaryColors = sampleBoundaryColors(cutCtx, loop.srcPoints, src)
  cutCtx.globalCompositeOperation = 'destination-in'
  cutCtx.drawImage(shape, 0, 0)
  cutCtx.globalCompositeOperation = 'source-over'
  keyOutBackground(cutCtx, loop.bounds, boundaryColors)
  return trimCanvas(cut)
}

/** Padding (source px) around the loop's crop so the matting model sees a little context. */
const REGION_CROP_PADDING = 16

/**
 * AI-detect lasso: crop the loop's region, let the (injected) matting provider cut the object
 * out of that crop — a tight crop makes "the subject" unambiguous — then intersect the matte
 * with the drawn loop and trim. The provider does the network work so this module stays pure
 * canvas. Null = stray loop or the matte found nothing (caller falls back to the geometric cut).
 */
export async function cutoutFromLassoDetect(
  background: HTMLImageElement,
  loopPoints: number[],
  src: { width: number; height: number },
  canvas: { w: number; h: number },
  transform: CanvasBackgroundTransform | undefined,
  matteProvider: (regionBlob: Blob) => Promise<HTMLImageElement>
): Promise<Trimmed | null> {
  const loop = analyzeLoop(loopPoints, src, canvas, transform)
  if (!loop) return null

  const cropX = Math.max(0, loop.bounds.x - REGION_CROP_PADDING)
  const cropY = Math.max(0, loop.bounds.y - REGION_CROP_PADDING)
  const crop: SourceRect = {
    x: cropX,
    y: cropY,
    width: Math.min(src.width, loop.bounds.x + loop.bounds.width + REGION_CROP_PADDING) - cropX,
    height: Math.min(src.height, loop.bounds.y + loop.bounds.height + REGION_CROP_PADDING) - cropY,
  }
  if (crop.width < 8 || crop.height < 8) return null

  const [region, regionCtx] = createDrawingCanvas(crop)
  regionCtx.drawImage(
    background,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  )
  const matte = await matteProvider(await canvasToBlob(region, 'image/png'))

  const [cut, cutCtx] = createDrawingCanvas(crop)
  cutCtx.drawImage(matte, 0, 0, crop.width, crop.height)
  cutCtx.globalCompositeOperation = 'destination-in'
  cutCtx.drawImage(
    loopShapeCanvas(
      crop,
      loop.srcPoints,
      { x: -crop.x, y: -crop.y },
      LASSO_FEATHER_CANVAS_PX * loop.scale
    ),
    0,
    0
  )
  const trimmed = await trimCanvas(cut)
  if (!trimmed) return null
  // The trim bbox is crop-local — shift it back into full-source coordinates for placement.
  return {
    blob: trimmed.blob,
    bbox: { ...trimmed.bbox, x: trimmed.bbox.x + crop.x, y: trimmed.bbox.y + crop.y },
  }
}

/**
 * Key out an element's flat background: its BORDER pixels are background by definition, so
 * colours matching them go transparent across the bitmap (same principle as the lasso cleanup).
 * Geometry stays unchanged. Null when nothing was detected/removed — no-op for the caller.
 */
export async function removeElementBackground(bitmap: HTMLImageElement): Promise<Blob | null> {
  const natural = naturalSize(bitmap)
  const [canvas, ctx] = createDrawingCanvas(natural)
  ctx.drawImage(bitmap, 0, 0)
  const w = natural.width - 1
  const h = natural.height - 1
  // Corners + edge midpoints — a border walk in point-list form so the loop sampler applies.
  const borderPoints = [0, 0, w / 2, 0, w, 0, w, h / 2, w, h, w / 2, h, 0, h, 0, h / 2]
  const samples = sampleBoundaryColors(ctx, borderPoints, natural)
  const before = ctx
    .getImageData(0, 0, natural.width, natural.height)
    .data.filter((_, i) => i % 4 === 3)
  keyOutBackground(ctx, { x: 0, y: 0, width: natural.width, height: natural.height }, samples)
  const after = ctx.getImageData(0, 0, natural.width, natural.height).data
  // keyOutBackground bails internally on near-total erasure; detect the true no-op case too.
  let changed = false
  for (let i = 3, j = 0; i < after.length; i += 4, j += 1) {
    if (after[i] !== before[j]) {
      changed = true
      break
    }
  }
  if (!changed) return null
  return canvasToBlob(canvas, 'image/png')
}

/**
 * Bake eraser strokes into an element's bitmap: painted areas become transparent. Dimensions and
 * geometry stay unchanged (holes, not a re-trim), so this is a plain src swap for the element.
 */
export async function eraseStrokesFromElement(
  bitmap: HTMLImageElement,
  strokes: BrushStroke[],
  element: CanvasImageNode
): Promise<Blob> {
  const natural = naturalSize(bitmap)
  const [canvas, ctx] = createDrawingCanvas(natural)
  ctx.drawImage(bitmap, 0, 0)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'black'
  const widthScale = natural.width / element.width
  for (const stroke of strokes) {
    ctx.lineWidth = stroke.size * widthScale
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
  return canvasToBlob(canvas, 'image/png')
}

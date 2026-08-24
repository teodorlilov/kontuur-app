import type { CanvasBackgroundTransform, CanvasImageNode } from '@/types/canvas'
import type { SourceRect } from '@/lib/canvas/reposition'
import type { BrushStroke } from '../types'
import { naturalSize } from './load-image'
import {
  canvasToBlob,
  createDrawingCanvas,
  mapPointsToSource,
  sourceSpaceFor,
  traceStrokesInElement,
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

/**
 * The loop boundary IS background by definition — sample its colours (deduped) for the key.
 *
 * Both options exist for the element keying below, and BOTH are deliberately off for the lasso:
 *
 * `step` — a lasso loop is hundreds of points along one outline, where consecutive points are
 * neighbours and thinning costs nothing. A border walk is eight points chosen to differ, and
 * thinning it threw six of them away.
 *
 * `skipTransparent` — a canvas reads a transparent pixel back as (0,0,0,0), so counting one as a
 * colour tells the key that the background is pure black, and the key then deletes every dark pixel
 * of the SUBJECT. That is fatal for an element whose whole border is transparent. The lasso samples
 * a background that is normally opaque, and on the rare one that is not, dropping the sample shifts
 * how much `KEY_SKIP_RATIO` erases — so the lasso keeps the behaviour it was tuned against rather
 * than inheriting a fix aimed at a different caller.
 */
function sampleBoundaryColors(
  ctx: CanvasRenderingContext2D,
  srcPoints: number[],
  src: { width: number; height: number },
  options: { step?: number; skipTransparent?: boolean } = {}
): number[][] {
  const step = options.step ?? BOUNDARY_SAMPLE_STEP
  const samples: number[][] = []
  for (let i = 0; i + 1 < srcPoints.length; i += 2 * step) {
    const x = Math.min(src.width - 1, Math.max(0, Math.round(srcPoints[i]!)))
    const y = Math.min(src.height - 1, Math.max(0, Math.round(srcPoints[i + 1]!)))
    const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data
    if (options.skipTransparent && a! <= ALPHA_THRESHOLD) continue
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

// Span guard + smoothing + crop mapping: a drawn loop turned into source-pixel geometry.
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

// The loop polygon as a feathered alpha shape, in full-source coordinates.
function loopShapeCanvas(
  size: { width: number; height: number },
  srcPoints: number[],
  blurPx: number
): HTMLCanvasElement {
  const [shape, ctx] = createDrawingCanvas(size)
  ctx.filter = `blur(${blurPx}px)`
  ctx.fillStyle = 'black'
  ctx.beginPath()
  for (let i = 0; i + 1 < srcPoints.length; i += 2) {
    if (i === 0) ctx.moveTo(srcPoints[i]!, srcPoints[i + 1]!)
    else ctx.lineTo(srcPoints[i]!, srcPoints[i + 1]!)
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

  const shape = loopShapeCanvas(src, loop.srcPoints, LASSO_FEATHER_CANVAS_PX * loop.scale)
  const [cut, cutCtx] = createDrawingCanvas(src)
  cutCtx.drawImage(background, 0, 0, src.width, src.height)
  const boundaryColors = sampleBoundaryColors(cutCtx, loop.srcPoints, src)
  cutCtx.globalCompositeOperation = 'destination-in'
  cutCtx.drawImage(shape, 0, 0)
  cutCtx.globalCompositeOperation = 'source-over'
  keyOutBackground(cutCtx, loop.bounds, boundaryColors)
  return trimCanvas(cut)
}

/**
 * What keying an element's background could find.
 *
 * Three outcomes rather than a blob-or-null, because the two failures need different answers and
 * the caller cannot tell them apart from a null: a picture with nothing behind it is FINISHED, and
 * saying "no flat background detected" about it is both true and useless. One with a busy
 * photographic background has a background all right — just not one this method can key.
 */
type ElementKeying =
  | { status: 'keyed'; blob: Blob }
  | { status: 'already-cutout' }
  | { status: 'not-flat' }

/**
 * Key out an element's flat background: its BORDER pixels are background by definition, so
 * colours matching them go transparent across the bitmap (same principle as the lasso cleanup).
 * Geometry stays unchanged.
 *
 * This only ever works on a picture sitting on ONE uniform colour — a generated SVG on its plate,
 * a logo on white. It is a colour match, not object detection, and it says so through its result.
 */
export async function removeElementBackground(bitmap: HTMLImageElement): Promise<ElementKeying> {
  const natural = naturalSize(bitmap)
  const [canvas, ctx] = createDrawingCanvas(natural)
  ctx.drawImage(bitmap, 0, 0)
  const w = natural.width - 1
  const h = natural.height - 1
  // Corners + edge midpoints, every one of them sampled: these eight points were CHOSEN to differ,
  // unlike a lasso outline where consecutive points are neighbours and thinning costs nothing. The
  // shared step used to drop six of the eight, so a picture whose two sampled corners happened to
  // hold artwork reported no background while four flat edges sat there unread.
  const borderPoints = [0, 0, w / 2, 0, w, 0, w, h / 2, w, h, w / 2, h, 0, h, 0, h / 2]
  const samples = sampleBoundaryColors(ctx, borderPoints, natural, {
    step: 1,
    skipTransparent: true,
  })
  // Every border point transparent: there is no background left to key, and going ahead would key
  // against nothing at all.
  if (samples.length === 0) return { status: 'already-cutout' }
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
  if (!changed) return { status: 'not-flat' }
  return { status: 'keyed', blob: await canvasToBlob(canvas, 'image/png') }
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
  // Everything painted is subtracted from what is already there — holes, not paint.
  ctx.globalCompositeOperation = 'destination-out'
  ctx.strokeStyle = 'black'
  traceStrokesInElement(ctx, strokes, element, natural)
  return canvasToBlob(canvas, 'image/png')
}

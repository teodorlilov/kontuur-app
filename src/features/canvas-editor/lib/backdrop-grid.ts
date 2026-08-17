import { CANVAS_PAPER } from '@/lib/canvas/constants'
import type { BackdropGrid } from '@/lib/canvas/contrast'
import { isImageNode, isShapeNode, visibleNodes } from '@/lib/canvas/doc-nodes'
import {
  backgroundNodeAttrs,
  imageBitmapAttrs,
  nodeGroupAttrs,
  scrimNodeAttrs,
  shapeChildAttrs,
} from '@/lib/canvas/node-attrs'
import type { Rgb } from '@/lib/visual/extract/color'
import type { CanvasDoc, CanvasImageNode, CanvasShapeNode } from '@/types/canvas'
import { decodedImage } from './load-image'

/**
 * Grid resolution. A tenth of the canvas in each axis — 108×135 cells over 1080×1350 — so one cell
 * is a 10px square of the real slide. Fine enough to tell a headline's band apart from a body's,
 * coarse enough that the whole measurement is a single small draw.
 */
const DIVISOR = 10

/** One reusable offscreen canvas. Building a fresh one per sample would allocate on every apply. */
let surface: HTMLCanvasElement | null = null

/**
 * Draw one placed asset or drawn shape, in DOC coordinates — the caller has already scaled the
 * context to the grid.
 *
 * Geometry comes from the same `node-attrs` resolvers the stage and the exporter read, never a
 * second implementation: a block the grid measures in a different place than the one it is drawn in
 * is worse than not measuring it at all, because the repaint it produces looks deliberate.
 *
 * `cornerRadius` is deliberately ignored. One cell is a 10px square of the slide, so a rounded
 * corner is a fraction of a cell in the corner of a box whose colour is being averaged.
 */
function drawNode(
  context: CanvasRenderingContext2D,
  node: CanvasImageNode | CanvasShapeNode
): void {
  const group = nodeGroupAttrs(node)
  context.save()
  context.globalAlpha = group.opacity
  context.translate(group.x, group.y)
  context.rotate((group.rotation * Math.PI) / 180)

  if (isImageNode(node)) {
    // A synchronous cache read. An asset that has not decoded yet simply is not sampled — the same
    // trade the apply-to-all path makes, and the alternative is awaiting a decode inside a measure.
    const image = decodedImage(node.src.publicUrl)
    if (image) {
      const bitmap = imageBitmapAttrs(node)
      // The mirror, expressed exactly as `imageBitmapAttrs` states it for Konva: a negative scale
      // about the node's far edge, which folds the box back onto itself and leaves x/y meaning the
      // top-left of the unflipped box.
      context.scale(bitmap.scaleX, bitmap.scaleY)
      context.translate(-bitmap.offsetX, -bitmap.offsetY)
      context.drawImage(image, 0, 0, bitmap.width, bitmap.height)
    }
  } else {
    const attrs = shapeChildAttrs(node)
    context.beginPath()
    if (node.kind === 'line') {
      context.moveTo(attrs.points[0] ?? 0, attrs.points[1] ?? 0)
      context.lineTo(attrs.points[2] ?? 0, attrs.points[3] ?? 0)
    } else if (node.kind === 'ellipse') {
      // Konva draws an Ellipse from its centre and `shapeChildAttrs` offsets it so the group origin
      // is the box's top-left; in 2D that is the same ellipse centred half a box in on each axis.
      const rx = attrs.width / 2
      const ry = attrs.height / 2
      context.ellipse(rx, ry, rx, ry, 0, 0, Math.PI * 2)
    } else {
      context.rect(0, 0, attrs.width, attrs.height)
    }
    if (attrs.fill) {
      context.fillStyle = attrs.fill
      context.fill()
    }
    if (attrs.stroke && attrs.strokeWidth > 0) {
      context.strokeStyle = attrs.stroke
      context.lineWidth = attrs.strokeWidth
      context.stroke()
    }
  }
  context.restore()
}

/**
 * Measure what is actually behind the text: the slide as it composes — cover-cropped, panned,
 * zoomed, dimmed by the doc's own scrim, and covered by whatever the doc itself draws — reduced to a
 * coarse colour grid.
 *
 * Composed rather than raw, because the scrim is precisely what makes text readable over a busy
 * picture. Sampling the bare image would report a slide as hopeless that the scrim has already
 * rescued, and repaint type that was fine.
 *
 * The doc's own nodes are drawn for the same reason, and it is not a refinement. The `field` lockup
 * reverses white copy out of an opaque brand-colour block; measuring the photograph the block covers
 * judged that copy against pixels no reader will ever see, and over light art repainted it to ink —
 * near-black on a dark block, at which point `lowContrastLabels` re-measured against the same wrong
 * surface and stayed silent about it.
 *
 * Text is the one kind NOT drawn: glyphs are sparse, so averaging them would report a headline's
 * own colour as the backdrop for anything near it. A shape ABOVE the copy does count — it already
 * occludes what it covers, so measuring against it is closer to what the reader sees than ignoring
 * it, and no lockup places one there.
 *
 * Returns null when the pixels cannot be read. That is not expected — `loadCrossOriginImage` sets
 * `crossOrigin='anonymous'` against a bucket serving `ACAO:*`, which is the same reason
 * `stage.toBlob` works at all — but a tainted canvas throws on `getImageData`, and a colour
 * suggestion is never worth taking the editor down for.
 */
export function buildBackdropGrid(doc: CanvasDoc, image: HTMLImageElement): BackdropGrid | null {
  if (typeof document === 'undefined') return null
  const cols = Math.max(1, Math.round(doc.canvas.w / DIVISOR))
  const rows = Math.max(1, Math.round(doc.canvas.h / DIVISOR))

  surface ??= document.createElement('canvas')
  surface.width = cols
  surface.height = rows
  const context = surface.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  // The sheet, not a clear: a cleared cell reads back as rgb(0,0,0) with alpha 0, so a background
  // with alpha made the grid report BLACK behind text the viewer sees on white — and the repaint
  // then picked a light fill for a light backdrop.
  context.fillStyle = CANVAS_PAPER
  context.fillRect(0, 0, cols, rows)

  // Drawn through the SAME resolver the stage and the exporter use, so the crop the grid measures
  // is the crop the viewer sees rather than a second implementation of cover-fit.
  const background = backgroundNodeAttrs(
    { width: image.naturalWidth, height: image.naturalHeight },
    doc.canvas,
    doc.backgroundTransform
  )
  try {
    context.drawImage(
      image,
      background.cropX,
      background.cropY,
      background.cropWidth,
      background.cropHeight,
      0,
      0,
      cols,
      rows
    )
  } catch {
    return null
  }

  const scrim = scrimNodeAttrs(doc.scrim, doc.canvas)
  if (scrim) {
    context.globalAlpha = scrim.opacity
    context.fillStyle = scrim.fill
    context.fillRect(
      (scrim.x / doc.canvas.w) * cols,
      (scrim.y / doc.canvas.h) * rows,
      (scrim.width / doc.canvas.w) * cols,
      (scrim.height / doc.canvas.h) * rows
    )
    context.globalAlpha = 1
  }

  // Scaled once, so every node below draws in doc coordinates and the attr resolvers can be read
  // verbatim instead of each call site multiplying its own geometry into grid space.
  context.save()
  context.scale(cols / doc.canvas.w, rows / doc.canvas.h)
  for (const node of visibleNodes(doc)) {
    if (isImageNode(node) || isShapeNode(node)) drawNode(context, node)
  }
  context.restore()

  let data: Uint8ClampedArray
  try {
    data = context.getImageData(0, 0, cols, rows).data
  } catch {
    return null
  }

  const cells: Rgb[] = new Array(cols * rows)
  for (let i = 0; i < cols * rows; i++) {
    const at = i * 4
    cells[i] = { r: data[at] ?? 0, g: data[at + 1] ?? 0, b: data[at + 2] ?? 0 }
  }
  return { cols, rows, cells, canvas: doc.canvas }
}

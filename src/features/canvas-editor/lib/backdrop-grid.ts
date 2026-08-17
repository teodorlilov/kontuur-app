import type { BackdropGrid } from '@/lib/canvas/contrast'
import { backgroundNodeAttrs, scrimNodeAttrs } from '@/lib/canvas/node-attrs'
import type { Rgb } from '@/lib/visual/extract/color'
import type { CanvasDoc } from '@/types/canvas'

/**
 * Grid resolution. A tenth of the canvas in each axis — 108×135 cells over 1080×1350 — so one cell
 * is a 10px square of the real slide. Fine enough to tell a headline's band apart from a body's,
 * coarse enough that the whole measurement is a single small draw.
 */
const DIVISOR = 10

/** One reusable offscreen canvas. Building a fresh one per sample would allocate on every apply. */
let surface: HTMLCanvasElement | null = null

/**
 * Measure what is actually behind the text: the background as the slide composes it — cover-cropped,
 * panned, zoomed, and dimmed by the doc's own scrim — reduced to a coarse colour grid.
 *
 * Composed rather than raw, because the scrim is precisely what makes text readable over a busy
 * picture. Sampling the bare image would report a slide as hopeless that the scrim has already
 * rescued, and repaint type that was fine.
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
  context.clearRect(0, 0, cols, rows)

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

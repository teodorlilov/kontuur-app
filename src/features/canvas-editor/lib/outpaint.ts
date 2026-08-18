import type { PaddedFrame } from '@/lib/canvas/outpaint-geometry'
import { canvasToBlob, createDrawingCanvas } from './source-space'

/**
 * The image an outpaint sends to the model: the original, centred, on a larger canvas.
 *
 * The border is filled with the original stretched to cover rather than left transparent. Two
 * reasons, both practical: a transparent PNG intermittently exceeds the upload size cap on a
 * photographic background, and a black border would be a strong, wrong hint about what belongs
 * there. The stretched fill is masked for repaint anyway — it only has to be plausible and cheap.
 */
export async function buildPaddedBackground(
  image: CanvasImageSource,
  frame: PaddedFrame
): Promise<{ blob: Blob; canvas: HTMLCanvasElement }> {
  const [canvas, ctx] = createDrawingCanvas(frame)

  // Cover-fill the whole frame with the source, then lay the crisp original back over the middle.
  const coverScale = Math.max(frame.width / frame.sourceWidth, frame.height / frame.sourceHeight)
  const coverWidth = frame.sourceWidth * coverScale
  const coverHeight = frame.sourceHeight * coverScale
  ctx.drawImage(
    image,
    (frame.width - coverWidth) / 2,
    (frame.height - coverHeight) / 2,
    coverWidth,
    coverHeight
  )
  ctx.drawImage(image, frame.left, frame.top, frame.sourceWidth, frame.sourceHeight)

  // The canvas comes back alongside the blob: the blob is what the model needs uploaded, and the
  // canvas is what the composite draws as "the original", with no object-URL round trip.
  return { blob: await canvasToBlob(canvas, 'image/jpeg', 0.92), canvas }
}

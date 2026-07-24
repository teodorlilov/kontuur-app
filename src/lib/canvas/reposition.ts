import type { CanvasBackgroundTransform } from '@/types/canvas'
import { MAX_BACKGROUND_ZOOM } from './constants'
import { coverCrop } from './cover-crop'

/** Centered cover fit — composing with this transform is identical to having none. */
export const DEFAULT_BACKGROUND_TRANSFORM: CanvasBackgroundTransform = {
  zoom: 1,
  offsetX: 0.5,
  offsetY: 0.5,
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

function clampZoom(zoom: number): number {
  return Math.min(Math.max(zoom, 1), MAX_BACKGROUND_ZOOM)
}

/**
 * Pan by a canvas-px delta: dragging right moves the ART right, i.e. the crop window slides left.
 * Axes without crop slack stay centered (offsets are fractions of slack, so 0-slack is singular).
 */
export function panBackground(
  transform: CanvasBackgroundTransform,
  delta: { dx: number; dy: number },
  src: { width: number; height: number },
  canvas: { w: number; h: number }
): CanvasBackgroundTransform {
  const crop = coverCrop(src.width, src.height, canvas.w, canvas.h, transform)
  const slackX = src.width - crop.cropWidth
  const slackY = src.height - crop.cropHeight
  return {
    zoom: transform.zoom,
    offsetX: slackX > 0 ? clamp01(transform.offsetX - (delta.dx * crop.cropWidth) / canvas.w / slackX) : 0.5,
    offsetY: slackY > 0 ? clamp01(transform.offsetY - (delta.dy * crop.cropHeight) / canvas.h / slackY) : 0.5,
  }
}

/**
 * Zoom to a target level toward a canvas-space focus point: the source pixel under the focus
 * stays put (until the crop window hits a source edge and the offset clamps).
 */
export function zoomBackgroundTo(
  transform: CanvasBackgroundTransform,
  targetZoom: number,
  focus: { x: number; y: number },
  src: { width: number; height: number },
  canvas: { w: number; h: number }
): CanvasBackgroundTransform {
  const zoom = clampZoom(targetZoom)
  if (zoom === transform.zoom) return transform
  const before = coverCrop(src.width, src.height, canvas.w, canvas.h, transform)
  const after = coverCrop(src.width, src.height, canvas.w, canvas.h, { ...transform, zoom })
  const cropX = before.cropX + (focus.x / canvas.w) * (before.cropWidth - after.cropWidth)
  const cropY = before.cropY + (focus.y / canvas.h) * (before.cropHeight - after.cropHeight)
  const slackX = src.width - after.cropWidth
  const slackY = src.height - after.cropHeight
  return {
    zoom,
    offsetX: slackX > 0 ? clamp01(cropX / slackX) : 0.5,
    offsetY: slackY > 0 ? clamp01(cropY / slackY) : 0.5,
  }
}

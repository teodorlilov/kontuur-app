import type { CanvasBackgroundTransform } from '@/types/canvas'

export interface CropAttrs {
  cropX: number
  cropY: number
  cropWidth: number
  cropHeight: number
}

/**
 * Cover-crop: the source rectangle (in source pixels) that fills a destination of the given
 * aspect with no distortion. Without a transform it is centered (same-aspect sources crop
 * nothing; legacy squares on the 4:5 canvas lose equal slivers left and right). A transform
 * zooms the window (`zoom` ≥ 1 shrinks it) and pans it by fractions of the crop slack
 * (offset 0.5 = centered) — the window can never leave the source for in-range values.
 */
export function coverCrop(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  transform?: CanvasBackgroundTransform
): CropAttrs {
  const scale = Math.max(dstW / srcW, dstH / srcH) * (transform?.zoom ?? 1)
  const cropWidth = dstW / scale
  const cropHeight = dstH / scale
  return {
    cropX: (srcW - cropWidth) * (transform?.offsetX ?? 0.5),
    cropY: (srcH - cropHeight) * (transform?.offsetY ?? 0.5),
    cropWidth,
    cropHeight,
  }
}

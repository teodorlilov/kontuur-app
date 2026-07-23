export interface CropAttrs {
  cropX: number
  cropY: number
  cropWidth: number
  cropHeight: number
}

/**
 * Centered cover-crop: the source rectangle (in source pixels) that fills a destination of the
 * given aspect with no distortion. Same-aspect sources crop nothing; legacy squares on the 4:5
 * canvas lose equal slivers left and right.
 */
export function coverCrop(srcW: number, srcH: number, dstW: number, dstH: number): CropAttrs {
  const scale = Math.max(dstW / srcW, dstH / srcH)
  const cropWidth = dstW / scale
  const cropHeight = dstH / scale
  return {
    cropX: (srcW - cropWidth) / 2,
    cropY: (srcH - cropHeight) / 2,
    cropWidth,
    cropHeight,
  }
}

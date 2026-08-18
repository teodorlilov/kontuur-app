import 'server-only'

import sharp from 'sharp'

interface JpegAsset {
  buffer: Buffer
  contentType: 'image/jpeg'
  fileName: string
}

/**
 * Convert an image buffer to JPEG for Instagram, which accepts no other
 * container format. Transparency is flattened onto white — post slides are
 * full-bleed, so a transparent background was never visible anyway.
 * Already-JPEG inputs pass through untouched.
 */
export async function toJpeg(
  buffer: Buffer,
  contentType: string,
  fileName: string
): Promise<JpegAsset> {
  const jpegName = fileName.replace(/\.(png|webp|gif|avif)$/i, '.jpg')
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
    return { buffer, contentType: 'image/jpeg', fileName: jpegName }
  }
  const converted = await sharp(buffer)
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 92 })
    .toBuffer()
  return { buffer: converted, contentType: 'image/jpeg', fileName: jpegName }
}

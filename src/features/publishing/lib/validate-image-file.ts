/** Hard cap on any single uploaded/pasted canvas image. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** MIME types accepted for canvas images (file picker, blob paste, and remote-URL paste). */
export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

/** Whether a MIME type is an accepted canvas image type. */
export function isAllowedImageType(type: string): boolean {
  return ALLOWED_IMAGE_TYPES.has(type)
}

/** Validate an uploaded image file's type and size; returns the error message or null when valid. */
export function validateImageFile(file: File): string | null {
  if (!isAllowedImageType(file.type)) return 'Only JPEG, PNG and WebP files are accepted'
  if (file.size > MAX_IMAGE_BYTES) return 'File must be under 8 MB'
  return null
}

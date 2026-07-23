const MAX_SIZE_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png'])

/** Validate an uploaded image file's type and size; returns the error message or null when valid. */
export function validateImageFile(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) return 'Only JPEG and PNG files are accepted'
  if (file.size > MAX_SIZE_BYTES) return 'File must be under 8 MB'
  return null
}

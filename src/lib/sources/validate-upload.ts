const ALLOWED_TYPES = new Set(['application/pdf', 'text/plain'])
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export interface UploadValidation {
  valid: boolean
  error?: string
}

/**
 * Validate an uploaded file for the source upload flow.
 * Checks MIME type and file size constraints.
 */
export function validateUpload(
  file: { type: string; size: number; name: string } | null,
  label: string | null | undefined
): UploadValidation {
  if (!file) {
    return { valid: false, error: 'No file provided' }
  }

  const trimmedLabel = typeof label === 'string' ? label.trim() : ''
  if (!trimmedLabel) {
    return { valid: false, error: 'Label is required' }
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return { valid: false, error: 'Only PDF and TXT files are supported' }
  }

  if (file.size > MAX_SIZE) {
    return { valid: false, error: 'File must be under 10MB' }
  }

  return { valid: true }
}

/**
 * Extract the file extension from a filename, defaulting to 'bin'.
 */
export function getFileExtension(filename: string): string {
  return filename.split('.').pop() ?? 'bin'
}

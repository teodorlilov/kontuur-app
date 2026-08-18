/**
 * Safely decode a percent-encoded URL for display.
 * Returns the original string if decoding fails (malformed sequences).
 */
export function decodeUrl(url: string): string {
  try {
    return decodeURIComponent(url)
  } catch {
    return url
  }
}

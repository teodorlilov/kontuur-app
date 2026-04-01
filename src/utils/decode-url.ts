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

/**
 * Decode all percent-encoded URLs found in a text string.
 * Useful for rendering captions that contain inline URLs.
 */
export function decodeUrlsInText(text: string): string {
  return text.replace(/https?:\/\/\S+/g, (match) => decodeUrl(match))
}

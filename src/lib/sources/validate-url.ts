/**
 * Validates a user-supplied URL before the server fetches it.
 * Rejects non-http(s) schemes and private/loopback IP ranges (SSRF protection).
 */
export function validateSourceUrl(url: string): boolean {
  try {
    const { protocol, hostname: h } = new URL(url)
    if (!['http:', 'https:'].includes(protocol)) return false
    // IPv4 private / loopback / link-local
    if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.)/.test(h)) return false
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false
    if (/^169\.254\./.test(h)) return false
    // IPv6 loopback and private ranges (hostname includes brackets)
    if (h === '::1' || h === '[::1]') return false
    if (/^\[?(fc|fd)/i.test(h) || /^\[?fe80/i.test(h)) return false
    return true
  } catch {
    return false
  }
}

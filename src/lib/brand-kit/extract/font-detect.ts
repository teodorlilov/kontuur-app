import type { FontCategory } from '@/lib/render/font-library'

const KNOWN_SERIF =
  /(georgia|times|garamond|playfair|merriweather|\blora\b|cormorant|cambria|palatino|spectral|noto serif|source serif|freight|tiempos|canela|ivar|recoleta)/
const KNOWN_MONO = /(mono|consolas|menlo|courier|jetbrains|fira code|ibm plex mono)/

/**
 * Classify a measured CSS `font-family` stack into a broad category so the extractor can map it to a
 * library family. Heuristic on the stack string (the browser resolves the actual face); the operator
 * confirms in Review. Distinguishes the `serif` generic from `sans-serif`.
 */
export function familyCategory(fontStack: string): FontCategory {
  const s = fontStack.toLowerCase()
  if (KNOWN_MONO.test(s)) return 'mono'
  if (KNOWN_SERIF.test(s)) return 'serif'
  const withoutSans = s.replace(/sans-serif/g, '')
  if (/\bserif\b/.test(withoutSans)) return 'serif'
  return 'sans'
}

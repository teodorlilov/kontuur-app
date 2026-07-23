import type { FontEntry } from './font-library'

/**
 * Google Fonts css2 href for a set of library entries — the single font path for the editor stage
 * and the offscreen exporter, so what you edit matches what exports. `display=swap` avoids a blank
 * flash; Cyrillic subsets load automatically via unicode-range.
 */
export function editorFontsHref(entries: readonly FontEntry[]): string | null {
  if (entries.length === 0) return null
  const params = entries.map((entry) => {
    const weights = [...entry.weights].sort((a, b) => a - b).join(';')
    return `family=${entry.family.replace(/ /g, '+')}:wght@${weights}`
  })
  return `https://fonts.googleapis.com/css2?${params.join('&')}&display=swap`
}

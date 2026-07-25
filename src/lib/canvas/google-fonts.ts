import type { FontEntry } from './font-library'

// css2 axis spec: weight-only families use `wght@w1;w2`; italic families must switch to the
// `ital,wght@` tuple form, upright tuples before italic (css2 rejects unsorted tuple lists).
function familyParam(entry: FontEntry): string {
  const family = entry.family.replace(/ /g, '+')
  const weights = [...entry.weights].sort((a, b) => a - b)
  if (!entry.italic) return `family=${family}:wght@${weights.join(';')}`
  const tuples = [
    ...weights.map((weight) => `0,${weight}`),
    ...weights.map((weight) => `1,${weight}`),
  ]
  return `family=${family}:ital,wght@${tuples.join(';')}`
}

/**
 * Google Fonts css2 href for a set of library entries — the single font path for the editor stage
 * and the offscreen exporter, so what you edit matches what exports. `display=swap` avoids a blank
 * flash; Cyrillic subsets load automatically via unicode-range.
 */
export function editorFontsHref(entries: readonly FontEntry[]): string | null {
  if (entries.length === 0) return null
  return `https://fonts.googleapis.com/css2?${entries.map(familyParam).join('&')}&display=swap`
}

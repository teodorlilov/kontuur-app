/**
 * Split a numbered-list layer's content into clean items — one per non-empty line, with any leading
 * ordinal or bullet the copy already carries stripped, since the renderer draws its own accent numerals
 * and must never double-number. Konva-free (pure string work) so it unit-tests in the node env and the
 * renderer imports it without pulling in canvas.
 *
 * Stripped: `01 `, `1.`, `1)`, `•`, `-`, `*` … followed by whitespace. A hyphen/asterisk *not* followed
 * by whitespace (e.g. `-5°C`, `2*3`) is kept — it's content, not a marker.
 */
const LEADING_MARKER = /^\s*(?:\d+[.)]?\s+|[•·▪◦*\-–—]\s+)/

export function parseListItems(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.replace(LEADING_MARKER, '').trim())
    .filter(Boolean)
}

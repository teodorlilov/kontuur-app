/** Extract all "Slide N" mentions from client feedback text. Returns sorted unique 1-based slide numbers. */
export function extractAllFlaggedSlides(note: string | null): number[] {
  if (!note) return []
  const matches = note.matchAll(/[Ss]lide\s+(\d+)/g)
  const seen = new Set<number>()
  for (const m of matches) {
    seen.add(parseInt(m[1]!, 10))
  }
  return Array.from(seen).sort((a, b) => a - b)
}

/** Extract the first "Slide N" mention from client feedback text. */
export function extractFlaggedSlide(note: string | null): number | null {
  const all = extractAllFlaggedSlides(note)
  return all[0] ?? null
}

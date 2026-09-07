/**
 * Shared display vocabulary for a published post — the type chip and the caption first line
 * that stands in for a title, spoken by the posts tables and both timelines' day cards.
 */

const TYPE_META: Record<string, { letter: string; label: string; tone: 'sage' | 'marker' }> = {
  CAROUSEL_ALBUM: { letter: 'C', label: 'carousel', tone: 'sage' },
  VIDEO: { letter: 'R', label: 'reel', tone: 'marker' },
  IMAGE: { letter: 'S', label: 'single', tone: 'sage' },
}

/**
 * The chip for a media type, or null when the network never said what the post was.
 *
 * That null is a deliberate write, not a gap: Facebook's post list carries no media-type
 * vocabulary, so its sync stores null (sync-facebook-metrics.ts). Defaulting it here would put
 * "single" and an "S" badge on every Facebook row, videos and link posts included —
 * facebook-posts-table.test.tsx pins that no such label appears. Callers render `·` instead.
 */
export function postTypeMeta(mediaType: string | null | undefined) {
  return (mediaType && TYPE_META[mediaType]) || null
}

export function firstLine(caption: string | null): string {
  if (!caption) return 'Untitled post'
  return caption.split('\n')[0]!.trim() || 'Untitled post'
}

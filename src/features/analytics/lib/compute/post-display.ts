/**
 * Shared display vocabulary for a published post: the type-chip letters the
 * posts table and the reach trend's publish pins both speak, and the caption
 * first-line that stands in for a title wherever a post is named.
 */

const TYPE_META: Record<string, { letter: string; label: string; tone: 'sage' | 'marker' }> = {
  CAROUSEL_ALBUM: { letter: 'C', label: 'carousel', tone: 'sage' },
  VIDEO: { letter: 'R', label: 'reel', tone: 'marker' },
  IMAGE: { letter: 'S', label: 'single', tone: 'sage' },
}

/**
 * The chip for a media type, or null when the network never said what the post was.
 *
 * Facebook's post list offers no media-type vocabulary, so its sync stores null on purpose —
 * and every renderer used to answer that null with `?? TYPE_META.IMAGE`, printing "single" and
 * an "S" badge on every Facebook row including videos and link posts. A guess substituted at
 * render time for a null the writer chose deliberately is worse than showing nothing.
 */
export function postTypeMeta(mediaType: string | null | undefined) {
  return (mediaType && TYPE_META[mediaType]) || null
}

export function firstLine(caption: string | null): string {
  if (!caption) return 'Untitled post'
  return caption.split('\n')[0]!.trim() || 'Untitled post'
}

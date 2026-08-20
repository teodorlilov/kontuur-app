/**
 * Shared display vocabulary for a published post: the type-chip letters the
 * posts table and the reach trend's publish pins both speak, and the caption
 * first-line that stands in for a title wherever a post is named.
 */

export const TYPE_META: Record<string, { letter: string; label: string; tone: 'sage' | 'marker' }> =
  {
    CAROUSEL_ALBUM: { letter: 'C', label: 'carousel', tone: 'sage' },
    VIDEO: { letter: 'R', label: 'reel', tone: 'marker' },
    IMAGE: { letter: 'S', label: 'single', tone: 'sage' },
  }

export function firstLine(caption: string | null): string {
  if (!caption) return 'Untitled post'
  return caption.split('\n')[0]!.trim() || 'Untitled post'
}

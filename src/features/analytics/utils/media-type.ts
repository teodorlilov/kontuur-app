import type React from 'react'

/** Returns inline background style for a media type thumbnail. */
export function typeColorStyle(mediaType: string): React.CSSProperties {
  if (mediaType === 'VIDEO') return { backgroundColor: 'var(--accent-m2)' }
  if (mediaType === 'CAROUSEL_ALBUM') return { backgroundColor: 'var(--accent-m1)' }
  return { backgroundColor: 'var(--color-brand-accent)' }
}

export function formatType(mediaType: string): string {
  if (mediaType === 'CAROUSEL_ALBUM') return 'Carousel'
  if (mediaType === 'VIDEO') return 'Video'
  return 'Image'
}

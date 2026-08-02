import type React from 'react'

/** Returns inline background style for a media type thumbnail. */
export function typeColorStyle(mediaType: string): React.CSSProperties {
  if (mediaType === 'VIDEO') return { backgroundColor: 'var(--metric-2)' }
  if (mediaType === 'CAROUSEL_ALBUM') return { backgroundColor: 'var(--metric-1)' }
  return { backgroundColor: 'var(--spring)' }
}

export function formatType(mediaType: string): string {
  if (mediaType === 'CAROUSEL_ALBUM') return 'Carousel'
  if (mediaType === 'VIDEO') return 'Video'
  return 'Image'
}

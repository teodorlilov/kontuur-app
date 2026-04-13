export function typeColor(mediaType: string): string {
  if (mediaType === 'VIDEO') return 'bg-purple-400'
  if (mediaType === 'CAROUSEL_ALBUM') return 'bg-indigo-400'
  return 'bg-blue-400'
}

export function formatType(mediaType: string): string {
  if (mediaType === 'CAROUSEL_ALBUM') return 'Carousel'
  if (mediaType === 'VIDEO') return 'Video'
  return 'Image'
}

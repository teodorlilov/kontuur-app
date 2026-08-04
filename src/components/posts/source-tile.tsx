/** Map source_type DB value to a human-readable label. */
export function sourceTypeLabel(type: string | null | undefined): string {
  if (type === 'rss') return 'News feed'
  if (type === 'website') return 'Website'
  if (type === 'file') return 'Document'
  if (type === 'web_search') return 'Web research'
  if (type === 'performance') return 'Past top post'
  return 'Source'
}

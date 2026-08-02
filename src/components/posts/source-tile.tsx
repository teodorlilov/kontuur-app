import { ExternalLink } from 'lucide-react'

interface SourceTileProps {
  sourceUrl?: string | null
  sourceTitle?: string | null
  sourceType?: string | null
  sourceExcerpt?: string | null
}

/** Compact source-origin tile with verify link. */
export function SourceTile({ sourceUrl, sourceTitle, sourceType, sourceExcerpt }: SourceTileProps) {
  if (!sourceUrl && !sourceTitle) return null

  const typeLabel = sourceTypeLabel(sourceType)
  const verifyUrl =
    sourceUrl ??
    `https://www.google.com/search?q=${encodeURIComponent((sourceExcerpt ?? '').slice(0, 120))}`

  return (
    <div
      className="text-micro"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: '10px',
        padding: '10px 14px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: 'var(--text2)',
          minWidth: 0,
        }}
      >
        <span style={{ flexShrink: 0 }}>Source</span>
        <span
          style={{
            fontWeight: 500,
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {typeLabel}
          {sourceTitle ? ` · ${sourceTitle}` : ''}
        </span>
      </div>
      <a
        href={verifyUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          flexShrink: 0,
          color: 'var(--spring-text)',
          fontWeight: 500,
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
        }}
      >
        Verify <ExternalLink size={10} />
      </a>
    </div>
  )
}

/** Map source_type DB value to a human-readable label. */
export function sourceTypeLabel(type: string | null | undefined): string {
  if (type === 'rss') return 'News feed'
  if (type === 'website') return 'Website'
  if (type === 'file') return 'Document'
  if (type === 'web_search') return 'Web research'
  if (type === 'performance') return 'Past top post'
  return 'Source'
}

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
  const verifyUrl = sourceUrl
    ?? `https://www.google.com/search?q=${encodeURIComponent((sourceExcerpt ?? '').slice(0, 120))}`

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        fontSize: '11px',
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border-1)',
        borderRadius: '10px',
        padding: '10px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-muted)', minWidth: 0 }}>
        <span style={{ flexShrink: 0 }}>Source</span>
        <span style={{ fontWeight: 500, color: 'var(--color-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {typeLabel}{sourceTitle ? ` · ${sourceTitle}` : ''}
        </span>
      </div>
      <a
        href={verifyUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ flexShrink: 0, color: 'var(--color-terracotta)', fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
      >
        Verify <ExternalLink size={10} />
      </a>
    </div>
  )
}

/** Map source_type DB value to a human-readable label. */
export function sourceTypeLabel(type: string | null | undefined): string {
  if (type === 'rss') return 'RSS Feed'
  if (type === 'website') return 'Website'
  if (type === 'file') return 'Document'
  if (type === 'web_search') return 'Web Search'
  return 'Source'
}

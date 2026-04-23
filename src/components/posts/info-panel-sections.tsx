'use client'

import { ExternalLink } from 'lucide-react'
import { PanelSection } from '@/components/posts/panel-section'
import { QualityScores } from '@/components/posts/quality-scores'
import { sourceTypeLabel } from '@/components/posts/source-tile'
import type { ValidationCriteria, ValidationScores } from '@/types/api'

/** Quality score section with big number + criteria breakdown. */
export function QualitySection({
  score,
  criteria,
  scores,
}: {
  score: number
  criteria: ValidationCriteria
  scores: ValidationScores
}) {
  return (
    <PanelSection
      title="Quality"
      rightContent={
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '24px',
            fontWeight: 400,
            color: score >= 7 ? 'var(--status-ok)' : 'var(--color-terracotta)',
          }}
        >
          {score}
        </span>
      }
    >
      <QualityScores criteria={criteria} scores={scores} />
    </PanelSection>
  )
}

/** Source info section for right panels (not the center-panel SourceTile). */
export function SourceInfoSection({
  sourceUrl,
  sourceTitle,
  sourceType,
  sourceExcerpt,
}: {
  sourceUrl?: string | null
  sourceTitle?: string | null
  sourceType?: string | null
  sourceExcerpt?: string | null
}) {
  if (!sourceExcerpt && !sourceTitle) return null

  const typeLabel = sourceTypeLabel(sourceType)

  return (
    <PanelSection title="Source">
      {sourceTitle && (
        <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-text-1)', marginBottom: '5px' }}>
          {typeLabel} · {sourceTitle}
        </div>
      )}
      {sourceExcerpt && (
        <div style={{ fontSize: '11px', color: 'var(--color-muted)', lineHeight: 1.6, marginBottom: '7px' }}>
          {sourceExcerpt}
        </div>
      )}
      {sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '10px', color: 'var(--color-terracotta)', fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <ExternalLink size={10} /> Verify source
        </a>
      ) : sourceExcerpt ? (
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(sourceExcerpt.slice(0, 120))}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '10px', color: 'var(--color-terracotta)', fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <ExternalLink size={10} /> Verify on Google
        </a>
      ) : null}
    </PanelSection>
  )
}

/** Key-value row for metadata sections. */
export function MetadataRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
      <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>{label}</span>
      <span style={{ fontSize: '11px', fontWeight: 500, color: valueColor ?? 'var(--color-text-1)' }}>{value}</span>
    </div>
  )
}

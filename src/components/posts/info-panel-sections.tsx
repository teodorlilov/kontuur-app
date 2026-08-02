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
            fontSize: 'var(--text-headline)',
            fontWeight: 400,
            // Both branches used to alias to --spring and render the same green.
            color: score >= 7 ? 'var(--spring-text)' : 'var(--pending)',
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
        <div className="text-micro font-medium text-ink" style={{ marginBottom: '5px' }}>
          {typeLabel} · {sourceTitle}
        </div>
      )}
      {sourceExcerpt && (
        <div className="text-micro text-text2" style={{ lineHeight: 1.6, marginBottom: '7px' }}>
          {sourceExcerpt}
        </div>
      )}
      {sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-micro font-medium text-spring-text"
          style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <ExternalLink size={10} /> Verify source
        </a>
      ) : sourceExcerpt ? (
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(sourceExcerpt.slice(0, 120))}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-micro font-medium text-spring-text"
          style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <ExternalLink size={10} /> Verify on Google
        </a>
      ) : null}
    </PanelSection>
  )
}

/** Key-value row for metadata sections. */
export function MetadataRow({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
      <span className="text-micro text-text2">{label}</span>
      <span className="text-micro font-medium" style={{ color: valueColor ?? 'var(--ink)' }}>
        {value}
      </span>
    </div>
  )
}

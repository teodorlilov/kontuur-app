'use client'

import { PanelSection } from '@/components/posts/panel-section'
import { QualitySection, SourceInfoSection, MetadataRow } from '@/components/posts/info-panel-sections'
import type { PostData, ValidationData } from '@/types/post'

interface RunSummary {
  clientName: string
  platform: string
  postsCount: number
  skippedCount: number
}

interface QualityPanelProps {
  post: PostData
  validationData: ValidationData
  runSummary: RunSummary
}

/** Right panel: quality scores, source context, and run summary. */
export function QualityPanel({ post, validationData, runSummary }: QualityPanelProps) {
  const { criteria, scores } = validationData

  return (
    <div
      className="hidden md:flex md:flex-col"
      style={{
        width: '350px',
        flexShrink: 0,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--line)',
        overflowY: 'auto',
      }}
    >
      <QualitySection score={scores.overall_score} criteria={criteria} scores={scores} />
      <SourceInfoSection
        sourceUrl={post.source_url}
        sourceTitle={post.source_title}
        sourceType={post.source_type}
        sourceExcerpt={post.source_excerpt}
      />
      <RunSummarySection summary={runSummary} />
    </div>
  )
}

function RunSummarySection({ summary }: { summary: RunSummary }) {
  return (
    <PanelSection title="Run summary">
      <MetadataRow label="Client" value={summary.clientName} />
      <MetadataRow label="Platform" value={summary.platform} />
      <MetadataRow label="Posts" value={`${summary.postsCount} generated`} />
      <MetadataRow
        label="Skipped"
        value={summary.skippedCount > 0 ? `${summary.skippedCount} pillar` : 'None'}
        // Was terracotta vs status-ok — both aliased to --spring, so the two
        // branches rendered identically. A skipped pillar is a wait, not an ok.
        valueColor={summary.skippedCount > 0 ? 'var(--pending)' : 'var(--spring-text)'}
      />
    </PanelSection>
  )
}

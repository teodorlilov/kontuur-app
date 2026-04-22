'use client'

import { ExternalLink } from 'lucide-react'
import { QualityScores } from '@/components/posts/quality-scores'
import type { PostData, ValidationData } from '@/components/posts/post-card'

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
  const { quality, criteria, scores } = validationData

  return (
    <div
      style={{
        width: '400px',
        flexShrink: 0,
        background: 'var(--color-surface)',
        borderLeft: '0.5px solid var(--color-border-1)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <QualitySection score={quality.quality_score_avg} criteria={criteria} scores={scores} />
      <SourceSection post={post} />
      <RunSummarySection summary={runSummary} />
    </div>
  )
}

function PanelSection({
  title,
  rightContent,
  children,
}: {
  title: string
  rightContent?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--color-border-1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '9px', fontWeight: 500, color: 'var(--color-muted)', letterSpacing: '1.2px', textTransform: 'uppercase' }}>
          {title}
        </span>
        {rightContent}
      </div>
      {children}
    </div>
  )
}

function QualitySection({
  score,
  criteria,
  scores,
}: {
  score: number
  criteria: ValidationData['criteria']
  scores: ValidationData['scores']
}) {
  return (
    <PanelSection
      title="Quality score"
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
      {criteria && scores && <QualityScores criteria={criteria} scores={scores} />}
    </PanelSection>
  )
}

function SourceSection({ post }: { post: PostData }) {
  if (!post.source_excerpt) return null

  return (
    <PanelSection title="Source context">
      {post.source_title && (
        <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-text-1)', marginBottom: '5px' }}>
          {post.source_type === 'rss' ? 'RSS Feed' : post.source_type === 'website' ? 'Website' : 'Source'} · {post.source_title}
        </div>
      )}
      <div style={{ fontSize: '11px', color: 'var(--color-muted)', lineHeight: 1.6, marginBottom: '7px' }}>
        {post.source_excerpt}
      </div>
      {post.source_url ? (
        <a
          href={post.source_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '10px', color: 'var(--color-terracotta)', fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <ExternalLink size={10} /> Verify source
        </a>
      ) : (
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(post.source_excerpt.slice(0, 120))}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '10px', color: 'var(--color-terracotta)', fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <ExternalLink size={10} /> Verify on Google
        </a>
      )}
    </PanelSection>
  )
}

function RunSummarySection({ summary }: { summary: RunSummary }) {
  return (
    <PanelSection title="Run summary">
      <RunRow label="Client" value={summary.clientName} />
      <RunRow label="Platform" value={summary.platform} />
      <RunRow label="Posts" value={`${summary.postsCount} generated`} />
      <RunRow
        label="Skipped"
        value={summary.skippedCount > 0 ? `${summary.skippedCount} pillar` : 'None'}
        valueColor={summary.skippedCount > 0 ? 'var(--color-terracotta)' : 'var(--status-ok)'}
      />
    </PanelSection>
  )
}

function RunRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
      <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>{label}</span>
      <span style={{ fontSize: '11px', fontWeight: 500, color: valueColor ?? 'var(--color-text-1)' }}>{value}</span>
    </div>
  )
}

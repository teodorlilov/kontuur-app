'use client'

import { AlertTriangle } from 'lucide-react'
import { formatRelativeTime } from '@/utils/format'
import { PanelSection } from '@/components/posts/panel-section'
import { SlopDetector } from '@/components/posts/slop-detector'
import { QualitySection, SourceInfoSection, MetadataRow } from '@/components/posts/info-panel-sections'
import { parseValidationJson } from '@/features/review/lib/parse-validation-json'
import type { ReviewPost } from '@/features/review/lib/filter-review-posts'
import type { SlopDetection } from '@/types/api'

interface ReviewInfoPanelProps {
  post: ReviewPost
  validationJson: unknown
  slopResult: SlopDetection | null
  slopLoading: boolean
}

/** Right panel: quality scores, health review, source context, and post info. */
export function ReviewInfoPanel({ post, validationJson, slopResult, slopLoading }: ReviewInfoPanelProps) {
  const qualityData = parseValidationJson(validationJson)

  return (
    <div
      className="hidden md:flex md:flex-col w-full md:w-[400px]"
      style={{
        flexShrink: 0,
        background: 'var(--color-surface)',
        borderLeft: '0.5px solid var(--color-border-1)',
        overflowY: 'auto',
      }}
    >
      {qualityData && (
        <QualitySection
          score={qualityData.scores.overall_score}
          criteria={qualityData.criteria}
          scores={qualityData.scores}
        />
      )}
      <AuthenticitySection slopResult={slopResult} slopLoading={slopLoading} />
      {post.is_health_niche && <HealthReviewSection />}
      <SourceInfoSection
        sourceUrl={post.source_url}
        sourceTitle={post.source_title}
        sourceType={post.source_type}
        sourceExcerpt={post.source_excerpt}
      />
      <PostInfoSection post={post} />
    </div>
  )
}

function AuthenticitySection({
  slopResult,
  slopLoading,
}: {
  slopResult: SlopDetection | null
  slopLoading: boolean
}) {
  if (!slopResult && !slopLoading) return null

  return (
    <PanelSection title="Authenticity">
      {slopLoading ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-muted)' }}>
          <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          Checking authenticity...
        </div>
      ) : slopResult ? (
        <SlopDetector result={slopResult} />
      ) : null}
    </PanelSection>
  )
}

function HealthReviewSection() {
  return (
    <PanelSection title="Health review">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          padding: '10px 12px',
          background: 'rgba(217,169,81,0.08)',
          borderRadius: '8px',
          border: '0.5px solid rgba(217,169,81,0.2)',
        }}
      >
        <AlertTriangle size={13} style={{ color: '#B8860B', flexShrink: 0, marginTop: '1px' }} />
        <span style={{ fontSize: '11px', color: '#8A6914', lineHeight: 1.5 }}>
          Medical content — verify all clinical claims before approving. Medical safety instructions will be added on publish.
        </span>
      </div>
    </PanelSection>
  )
}

function PostInfoSection({ post }: { post: ReviewPost }) {
  return (
    <PanelSection title="Post info">
      <MetadataRow label="Client" value={post.client_name} />
      <MetadataRow label="Platform" value={post.platform ?? 'Unknown'} />
      <MetadataRow label="Generated" value={formatRelativeTime(new Date(post.created_at))} />
    </PanelSection>
  )
}

'use client'

import { ExternalLink } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/button'
import { usePostActions } from '@/components/posts/use-post-actions'
import { useScheduleModal } from '@/components/scheduling/use-schedule-modal'
import { useBestTime } from '@/components/posts/use-best-time'
import { ScheduleModal } from '@/components/scheduling/schedule-modal'
import { PostContentDisplay } from '@/components/posts/post-content-display'
import {
  REWRITE_SCORE_THRESHOLD,
  AUTHENTICITY_URGENT_THRESHOLD,
} from '@/lib/content-rules/constants'
import type { PostData, ValidationData } from '@/components/posts/post-card'

interface PostDetailProps {
  post: PostData
  validationData: ValidationData
  onApprove: (postId: string) => void
  onDiscard: (postId: string) => void
  onRegenerate: (postId: string, updatedPost: PostData, updatedValidation: ValidationData) => void
}

/** Middle panel: post content with scrollable body and fixed action bar. */
export function PostDetail({ post, validationData, onApprove, onDiscard, onRegenerate }: PostDetailProps) {
  const {
    caption,
    setCaption,
    slidesJson,
    setSlidesJson,
    approving,
    regenerating,
    approve,
    regenerate,
  } = usePostActions({ post, onApprove, onRegenerate })

  const scheduleModal = useScheduleModal()
  const { bestTimeData } = useBestTime(post.client_id)

  const { slop, criteria, scores } = validationData
  const hasLowQuality = scores.overall_score < REWRITE_SCORE_THRESHOLD
  const hasLowAuthenticity = slop.human_authenticity_score < AUTHENTICITY_URGENT_THRESHOLD
  const hasAiTells = slop.ai_tells_found.length > 0
  const showRewrite = hasLowAuthenticity || hasAiTells || hasLowQuality

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-page)', minWidth: 0 }}>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <SourceTile post={post} />
        <div
          style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border-1)',
            borderRadius: '14px',
            padding: '24px',
            boxShadow: '0 1px 8px rgba(44,62,80,0.05)',
          }}
        >
          <PostContentDisplay
            caption={caption}
            platform={post.platform}
            postType={post.post_type}
            slidesJson={slidesJson}
            priority={post.priority}
            qualityScoreAvg={post.quality_score_avg}
            pillar={post.pillar}
            editable
            onCaptionChange={setCaption}
            onSlidesChange={(slides) => setSlidesJson(slides)}
          />
        </div>
        {showRewrite && (
          <RewriteButton
            hasLowAuthenticity={hasLowAuthenticity}
            hasLowQuality={hasLowQuality}
            regenerating={regenerating}
            onClick={() => {
              const qualityIssues = criteria.issues.map((i: { type: string; description: string }) => `${i.type}: ${i.description}`)
              const noop = () => {}
              void regenerate(slop.ai_tells_found, qualityIssues, noop, noop)
            }}
          />
        )}
        <ActionBar
          approving={approving}
          showRewrite={showRewrite}
          regenerating={regenerating}
          onApprove={() => scheduleModal.openModal()}
          onDiscard={() => onDiscard(post.id)}
        />
      </div>
      <ScheduleModal
        open={scheduleModal.isOpen}
        onClose={scheduleModal.closeModal}
        onSchedule={(scheduledAt) => {
          scheduleModal.closeModal()
          void approve(scheduledAt ?? undefined)
        }}
        bestTimeData={bestTimeData}
        platform={post.platform}
        loading={approving}
        selectedDate={scheduleModal.selectedDate}
        setSelectedDate={scheduleModal.setSelectedDate}
        selectedTime={scheduleModal.selectedTime}
        setSelectedTime={scheduleModal.setSelectedTime}
      />
    </div>
  )
}

function RewriteButton({
  hasLowAuthenticity,
  hasLowQuality,
  regenerating,
  onClick,
}: {
  hasLowAuthenticity: boolean
  hasLowQuality: boolean
  regenerating: boolean
  onClick: () => void
}) {
  return (
    <Button
      onClick={onClick}
      loading={regenerating}
      variant="secondary"
      size="sm"
      className={cn(
        hasLowAuthenticity
          ? 'text-red-600 border-red-200 hover:bg-red-50'
          : hasLowQuality
            ? 'text-amber-600 border-amber-200 hover:bg-amber-50'
            : 'text-gray-600 border-gray-200 hover:bg-gray-50'
      )}
    >
      {regenerating
        ? 'Rewriting...'
        : hasLowAuthenticity
          ? 'Rewrite — reads as AI'
          : hasLowQuality
            ? 'Rewrite — low quality'
            : 'Rewrite to improve'}
    </Button>
  )
}

function sourceTypeLabel(type: string | null | undefined): string {
  if (type === 'rss') return 'RSS Feed'
  if (type === 'website') return 'Website'
  if (type === 'file') return 'Document'
  if (type === 'web_search') return 'Web Search'
  return 'Trend-based'
}

function SourceTile({ post }: { post: PostData }) {
  if (!post.source_url && !post.source_title) return null

  const typeLabel = sourceTypeLabel(post.source_type)
  const verifyUrl = post.source_url
    ?? `https://www.google.com/search?q=${encodeURIComponent((post.source_excerpt ?? '').slice(0, 120))}`

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
          {typeLabel}{post.source_title ? ` · ${post.source_title}` : ''}
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

function ActionBar({
  approving,
  showRewrite,
  regenerating,
  onApprove,
  onDiscard,
}: {
  approving: boolean
  showRewrite: boolean
  regenerating: boolean
  onApprove: () => void
  onDiscard: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <Button onClick={onApprove} loading={approving} className="flex-1" size="sm">
        Approve
      </Button>
      <Button onClick={onDiscard} variant="ghost" size="sm" className="text-gray-500 hover:text-red-600">
        Discard
      </Button>
    </div>
  )
}

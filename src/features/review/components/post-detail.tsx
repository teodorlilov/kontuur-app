'use client'

import { Copy, ChevronLeft, ChevronRight } from 'lucide-react'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import { ComposedSlides } from '@/components/posts/composed-slides'
import type { ApprovalBatchData, ApprovalPostData, CarouselSlide } from '@/types/api'
import { SlidesSection } from './slides-section'
import { FeedbackBox } from './feedback-box'
import { ActionBar } from './action-bar'
import { APPROVAL_STATUS_STYLES, type ApprovalPostStatus } from './types'

interface PostDetailProps {
  post: ApprovalPostData
  visualKit?: ApprovalBatchData['visualKit']
  postIndex: number
  totalPosts: number
  status: ApprovalPostStatus
  feedback: string
  onFeedbackChange: (v: string) => void
  onNavigate: (dir: 1 | -1) => void
  onApprove: () => void
  onRequestChanges: () => void
  onApproveAll: () => void
  totalPending: number
  isSubmitting: boolean
}

/** Small pill for the meta topbar. */
function MetaPill({ label, dotColor }: { label: string; dotColor?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontWeight: 500,
        padding: '3px 9px',
        borderRadius: 6,
        background: 'rgba(44,62,80,0.06)',
        color: '#3A4A54',
        whiteSpace: 'nowrap',
      }}
    >
      {dotColor && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: dotColor,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </span>
  )
}

/** Arrow button for post navigation. */
function NavButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'prev' | 'next'
  disabled: boolean
  onClick: () => void
}) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        border: '0.5px solid rgba(44,62,80,0.12)',
        background: '#fff',
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : 1,
        transition: 'opacity 0.12s',
      }}
    >
      <Icon size={14} color="#3A4A54" />
    </button>
  )
}

/** Format scheduled_at into a readable date string. */
function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** Build a post type label from post_type and slides_json. */
function postTypeLabel(postType: string, slides: unknown): string {
  if (postType === 'carousel') {
    const count = Array.isArray(slides) ? slides.length : 0
    return `Carousel · ${count} slides`
  }
  return 'Single image'
}

/** Meta topbar showing post pills and navigation arrows. */
function MetaTopbar({ post, postIndex, totalPosts, status, onNavigate }: {
  post: ApprovalPostData
  postIndex: number
  totalPosts: number
  status: ApprovalPostStatus
  onNavigate: (dir: 1 | -1) => void
}) {
  const pillar = post.pillar ? getPillarColor(post.pillar) : null
  const statusStyle = status !== 'pending' ? APPROVAL_STATUS_STYLES[status] : null

  return (
    <div
      style={{
        padding: '10px 20px',
        background: '#fff',
        borderBottom: '0.5px solid rgba(44,62,80,0.07)',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        flexShrink: 0,
        flexWrap: 'wrap',
      }}
    >
      <MetaPill label={`#${postIndex + 1}`} />
      <MetaPill label={formatDate(post.scheduled_at)} />
      {post.platform && <MetaPill label={post.platform} />}
      <MetaPill label={postTypeLabel(post.post_type, post.slides_json)} />
      {post.pillar && <MetaPill label={post.pillar} dotColor={pillar?.hex} />}
      {statusStyle && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            padding: '3px 9px',
            borderRadius: 6,
            background: statusStyle.bg,
            color: statusStyle.color,
          }}
        >
          {statusStyle.label}
        </span>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
        <NavButton direction="prev" disabled={postIndex === 0} onClick={() => onNavigate(-1)} />
        <NavButton
          direction="next"
          disabled={postIndex === totalPosts - 1}
          onClick={() => onNavigate(1)}
        />
      </div>
    </div>
  )
}

/** Caption card with copy button. */
function CaptionCard({ caption }: { caption: string | null }) {
  if (!caption) return null
  return (
    <div
      style={{
        background: '#fff',
        border: '0.5px solid rgba(44,62,80,0.10)',
        borderRadius: 12,
        padding: '16px 18px',
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 500,
          color: '#8A8070',
          letterSpacing: '1.2px',
          textTransform: 'uppercase' as const,
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        Caption
        <button
          onClick={() => navigator.clipboard?.writeText(caption)}
          style={{
            fontSize: 10,
            color: '#C07B55',
            fontWeight: 500,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Copy size={10} />
          Copy
        </button>
      </div>
      <div
        style={{
          fontSize: 14,
          color: '#1A2630',
          lineHeight: 1.72,
          whiteSpace: 'pre-wrap',
        }}
      >
        {caption}
      </div>
    </div>
  )
}

/** Right panel showing full post detail with caption, slides, feedback, and actions. */
export function PostDetail({
  post,
  visualKit,
  postIndex,
  totalPosts,
  status,
  feedback,
  onFeedbackChange,
  onNavigate,
  onApprove,
  onRequestChanges,
  onApproveAll,
  totalPending,
  isSubmitting,
}: PostDetailProps) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <MetaTopbar
        post={post}
        postIndex={postIndex}
        totalPosts={totalPosts}
        status={status}
        onNavigate={onNavigate}
      />

      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '18px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          background: '#F4EFE6',
        }}
      >
        <CaptionCard caption={post.caption} />
        <SlidesSection slidesJson={post.slides_json} postType={post.post_type} />
        {post.post_type === 'carousel' && visualKit && Array.isArray(post.slides_json) && (
          <div
            style={{
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border-1)',
              borderRadius: 12,
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: 1.2, textTransform: 'uppercase', color: '#8A8070' }}>Designed slides</div>
            <ComposedSlides
              slides={post.slides_json as CarouselSlide[]}
              tokens={visualKit.tokens}
              feedSystemSlug={visualKit.feedSystemSlug}
              clientName={visualKit.clientName}
            />
          </div>
        )}
        {status !== 'approved' && (
          <FeedbackBox
            mode={status === 'changes_requested' ? 'read-only' : 'input'}
            value={status === 'changes_requested' ? feedback : feedback}
            onChange={status === 'pending' ? onFeedbackChange : undefined}
          />
        )}
      </div>

      <ActionBar
        status={status}
        totalPending={totalPending}
        onApprove={onApprove}
        onRequestChanges={onRequestChanges}
        onApproveAll={onApproveAll}
        isSubmitting={isSubmitting}
      />
    </div>
  )
}

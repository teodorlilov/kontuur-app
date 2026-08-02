'use client'

import { Copy, ChevronLeft, ChevronRight } from 'lucide-react'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import { formatScheduleDate } from '@/utils/format'
import type { ApprovalPostData } from '@/types/api'
import { SlidesSection } from './slides-section'
import { PostImagePreview } from './post-image-preview'
import { FeedbackBox } from './feedback-box'
import { ActionBar } from './action-bar'
import { APPROVAL_STATUS_STYLES, type ApprovalPostStatus } from './types'

interface PostDetailProps {
  post: ApprovalPostData
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
      className="text-micro"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontWeight: 500,
        padding: '3px 9px',
        borderRadius: 6,
        background: 'rgba(15,21,18,0.06)',
        color: 'var(--text2)',
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
        border: '1px solid rgba(15,21,18,0.12)',
        background: '#fff',
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : 1,
        transition: 'opacity 0.12s',
      }}
    >
      <Icon size={14} color="var(--text2)" />
    </button>
  )
}

/** Format scheduled_at into a readable date string. */

/** Build a post type label from post_type and slides_json. */
function postTypeLabel(postType: string, slides: unknown): string {
  if (postType === 'carousel') {
    const count = Array.isArray(slides) ? slides.length : 0
    return `Carousel · ${count} slides`
  }
  return 'Single image'
}

/** Meta topbar showing post pills and navigation arrows. */
function MetaTopbar({
  post,
  postIndex,
  totalPosts,
  status,
  onNavigate,
}: {
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
        borderBottom: '1px solid rgba(15,21,18,0.07)',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        flexShrink: 0,
        flexWrap: 'wrap',
      }}
    >
      <MetaPill label={`#${postIndex + 1}`} />
      <MetaPill label={post.scheduled_at ? formatScheduleDate(new Date(post.scheduled_at)) : ''} />
      {post.platform && <MetaPill label={post.platform} />}
      <MetaPill label={postTypeLabel(post.post_type, post.slides_json)} />
      {post.pillar && <MetaPill label={post.pillar} dotColor={pillar?.hex} />}
      {statusStyle && (
        <span
          className="text-micro"
          style={{
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
        border: '1px solid rgba(15,21,18,0.10)',
        borderRadius: 12,
        padding: '16px 18px',
      }}
    >
      <div
        className="text-label"
        style={{
          fontWeight: 500,
          color: 'var(--text2)',
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
          className="text-label tracking-normal"
          onClick={() => navigator.clipboard?.writeText(caption)}
          style={{
            color: 'var(--spring-text)',
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
        className="text-body"
        style={{
          color: 'var(--ink)',
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
          background: 'var(--paper)',
        }}
      >
        <CaptionCard caption={post.caption} />
        {post.post_type !== 'carousel' && (
          <PostImagePreview
            image={post.images.find((img) => img.position === 0) ?? null}
            altText={post.caption?.slice(0, 80) ?? 'Post visual'}
          />
        )}
        <SlidesSection
          slidesJson={post.slides_json}
          postType={post.post_type}
          images={post.images}
        />
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

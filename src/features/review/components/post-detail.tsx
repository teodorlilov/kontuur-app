'use client'

import { Copy, ChevronLeft, ChevronRight } from 'lucide-react'
import { postTypeLabel } from '@/features/review/lib/queue-post'
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
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-[6px] bg-ink/6 px-[9px] py-[3px] text-micro font-medium text-text2">
      {dotColor && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dotColor }} />
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
      className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-ink/12 bg-surface transition-opacity duration-120 ease-[ease]"
      onClick={onClick}
      disabled={disabled}
      style={{
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Icon size={14} color="var(--text2)" />
    </button>
  )
}

/** Format scheduled_at into a readable date string. */

/** Build a post type label from post_type and slides_json. */
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
    <div className="flex shrink-0 flex-wrap items-center gap-[7px] border-b border-ink/7 bg-surface px-5 py-2.5">
      <MetaPill label={`#${postIndex + 1}`} />
      <MetaPill label={post.scheduled_at ? formatScheduleDate(new Date(post.scheduled_at)) : ''} />
      {post.platform && <MetaPill label={post.platform} />}
      <MetaPill label={postTypeLabel(post.post_type, post.slides_json)} />
      {post.pillar && <MetaPill label={post.pillar} dotColor={pillar?.hex} />}
      {statusStyle && (
        <span
          className="rounded-[6px] px-[9px] py-[3px] text-micro font-medium"
          style={{ background: statusStyle.bg, color: statusStyle.color }}
        >
          {statusStyle.label}
        </span>
      )}

      <div className="ml-auto flex gap-[5px]">
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
    <div className="rounded-[12px] border border-ink/10 bg-surface px-[18px] py-4">
      {/* tracking-[1.2px]: tighter than the Label role's own 0.16em (1.6px at its
          10px step) — the caption eyebrow sits closer than a standalone label. */}
      <div className="mb-2.5 flex items-center justify-between text-label font-medium uppercase tracking-[1.2px] text-text2">
        Caption
        {/* tracking-normal: cancels the Label role's 0.16em — this is a button, not
            a spaced-out eyebrow. */}
        <button
          className="flex cursor-pointer items-center gap-1 border-0 bg-transparent text-label font-medium tracking-normal text-spring-text"
          onClick={() => navigator.clipboard?.writeText(caption)}
        >
          <Copy size={10} />
          Copy
        </button>
      </div>
      {/* leading-[1.72]: the Body role runs 1.6, which is tight for a full caption
          read as a paragraph rather than as UI text. */}
      <div className="whitespace-pre-wrap text-body leading-[1.72] text-ink">{caption}</div>
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
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <MetaTopbar
        post={post}
        postIndex={postIndex}
        totalPosts={totalPosts}
        status={status}
        onNavigate={onNavigate}
      />

      {/* Scrollable content */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-paper px-[22px] py-[18px]">
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

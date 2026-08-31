'use client'

import { Clock, Check, MessageCircle } from 'lucide-react'
import { cn } from '@/utils/cn'
import { postTypeLabel } from '@/features/review/lib/queue-post'
import { ActiveBar, CaptionPreview } from '@/components/posts/post-list-parts'
import { getPillarColor } from '@/components/ui/colors/identity-colors'
import { formatScheduleDate } from '@/utils/format'
import type { ApprovalPostData } from '@/types/api'
import { APPROVAL_STATUS_STYLES, type ApprovalPostStatus } from './types'

interface PostListItemProps {
  post: ApprovalPostData
  index: number
  status: ApprovalPostStatus
  isActive: boolean
  onClick: () => void
}

/** Format scheduled_at into a short date like "Sat, Apr 25". */

/** Build a human-readable post type label. */
/** Small status badge showing pending / approved / feedback sent. */
function ApprovalStatusBadge({ status }: { status: ApprovalPostStatus }) {
  const s = APPROVAL_STATUS_STYLES[status]
  const Icon = status === 'pending' ? Clock : status === 'approved' ? Check : MessageCircle
  return (
    // tracking-normal: cancels the Label role's built-in 0.16em — a badge this
    // small reads as a word, and 1.6px of tracking pulls it apart.
    <div
      className="inline-flex items-center gap-1 rounded-xs px-[7px] py-0.5 text-label font-medium tracking-normal"
      style={{ background: s.bg, color: s.color }}
    >
      <Icon size={9} />
      {s.label}
    </div>
  )
}

/** Single post row in the left-panel list. */
export function PostListItem({ post, index, status, isActive, onClick }: PostListItemProps) {
  const date = post.scheduled_at ? formatScheduleDate(new Date(post.scheduled_at)) : null
  const pillar = post.pillar ? getPillarColor(post.pillar) : null

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative cursor-pointer overflow-hidden border-b border-ink/5.5 px-4 py-[13px] transition-[background] duration-120 ease-[ease]',
        isActive ? 'bg-ink/3.5' : 'bg-transparent hover:bg-sunken'
      )}
    >
      {isActive && <ActiveBar />}

      {/* Row 1: number · date · platform.
          tracking-normal throughout: cancels the Label role's built-in 0.16em, which
          is set for eyebrows — these are values (an index, a date, a platform). */}
      <div className="mb-1 flex items-center justify-between">
        <span className="text-label font-medium tracking-normal text-text2">#{index}</span>
        {date && <span className="text-label tracking-normal text-text2">{date}</span>}
        {post.platform && (
          <span className="rounded-[3px] bg-spring/12 px-[7px] py-px text-label font-medium tracking-normal text-spring-text">
            {post.platform}
          </span>
        )}
      </div>

      {/* Row 2: pillar + type */}
      <div className="mb-[5px] flex flex-wrap items-center gap-[5px]">
        {post.pillar && pillar && (
          <div className="flex items-center gap-1 text-micro font-medium text-ink">
            <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: pillar.hex }} />
            {post.pillar}
          </div>
        )}
        {/* tracking-normal: see row 1 — this is a type name, not an eyebrow. */}
        <span className="text-label tracking-normal text-text2">
          · {postTypeLabel(post.post_type, post.slides_json)}
        </span>
      </div>

      {/* Row 3: caption preview */}
      <CaptionPreview caption={post.caption} />

      {/* Row 4: status badge */}
      <ApprovalStatusBadge status={status} />
    </div>
  )
}

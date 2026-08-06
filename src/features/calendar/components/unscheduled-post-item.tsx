'use client'

import { memo } from 'react'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import { cn } from '@/utils/cn'
import { formatDayMonth } from '@/utils/format'
import type { CalendarPost } from '@/types/api'

interface UnscheduledPostItemProps {
  post: CalendarPost
  isActive: boolean
  onClick: () => void
}

/** Single row in the unscheduled slide panel. */
export const UnscheduledPostItem = memo(function UnscheduledPostItem({
  post,
  isActive,
  onClick,
}: UnscheduledPostItemProps) {
  const pillarColor = post.pillar ? getPillarColor(post.pillar).hex : 'var(--text2)'
  const score = post.quality_score_avg ?? 0

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative cursor-pointer border-b border-ink/[0.055] px-[18px] py-[11px]',
        isActive ? 'bg-ink/[0.035]' : 'bg-transparent'
      )}
      // `background 0.12s` rides the default `ease`; Tailwind's transition-*
      // would swap in its own curve.
      style={{ transition: 'background 0.12s' }}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute bottom-[15%] left-0 top-[15%] w-[2.5px] rounded-r-[2px] bg-forest" />
      )}

      {/* Row 1: client + priority + score */}
      <div className="mb-[3px] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {/* The dot takes the post's pillar hue, so it stays a value. */}
          <span className="size-[7px] shrink-0 rounded-full" style={{ background: pillarColor }} />
          <span className="text-micro font-medium text-ink">{post.client_name}</span>
          {post.priority && (
            // tracking-normal cancels the Label role's built-in 0.16em.
            <span className="inline-flex items-center gap-[3px] rounded-[3px] bg-spring/[0.14] px-1.5 py-px text-label font-medium tracking-normal text-forest">
              Priority
            </span>
          )}
        </div>
        <span
          className="text-micro font-medium"
          // Banded off the score, so the colour stays a value.
          style={{
            color:
              score >= 9
                ? 'var(--spring-text)'
                : score >= 7
                  ? 'var(--spring-text)'
                  : 'var(--danger)',
          }}
        >
          {score}/10
        </span>
      </div>

      {/* Row 2: pillar + type */}
      {/* tracking-normal cancels the Label role's built-in 0.16em. */}
      <div className="mb-1 text-label tracking-normal text-text2">
        {post.pillar ?? 'No pillar'}
        {' · '}
        {post.post_type === 'carousel'
          ? `Carousel · ${Array.isArray(post.slides_json) ? post.slides_json.length : 0} slides`
          : 'Single image'}
      </div>

      {/* Row 3: caption preview */}
      {/* leading-[1.45]: a two-line clamp reads as a block, so it sets tighter
          than Micro's 1.35-derived rhythm would leave it. */}
      <div className="mb-1.5 line-clamp-2 text-micro leading-[1.45] text-text2">
        {post.caption ?? 'No caption'}
      </div>

      {/* Row 4: platform tag + timestamp */}
      {/* tracking-normal on each chip cancels the Label role's built-in 0.16em. */}
      <div className="flex items-center gap-[5px]">
        {post.platform && (
          <span className="rounded-[3px] bg-spring/[0.12] px-1.5 py-0.5 text-label font-medium tracking-normal text-forest">
            {post.platform}
          </span>
        )}
        <span className="rounded-[3px] bg-ink/[0.06] px-1.5 py-0.5 text-label font-medium tracking-normal text-text2">
          {post.post_type === 'carousel' ? 'Carousel' : 'Single'}
        </span>
        <span className="ml-auto text-label tracking-normal text-text3">
          {timeAgo(post.created_at)}
        </span>
      </div>
    </div>
  )
})

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'Yesterday'
  if (diffD < 7) return `${diffD}d ago`
  return formatDayMonth(new Date(dateStr))
}

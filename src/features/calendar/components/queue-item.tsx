'use client'

import { memo } from 'react'
import { cn } from '@/utils/cn'
import { ActiveBar, CaptionPreview } from '@/components/posts/post-list-parts'
import { getPillarColor } from '@/components/ui/colors/identity-colors'
import { scoreTextColor } from '@/components/ui/colors/score-colors'
import { postTypeLabel } from '@/features/review/lib/queue-post'
import { formatRelativeTime, parseTimestamp } from '@/utils/format'
import type { CalendarPost } from '@/types/api'

/**
 * One post waiting to be placed.
 *
 * Every part of this row already existed somewhere: the active bar and the caption clamp
 * in `components/posts/post-list-parts`, the carousel label in `postTypeLabel`, the score
 * banding in `scoreTextColor`, and relative time in `formatRelativeTime`. The row this
 * replaces reimplemented all four inline, and its copy of the active bar had already
 * drifted to a different inset from the shared one.
 */
export const QueueItem = memo(function QueueItem({
  post,
  isActive,
  onClick,
}: {
  post: CalendarPost
  isActive: boolean
  onClick: (post: CalendarPost) => void
}) {
  const score = post.quality_score_avg
  const pillar = post.pillar ? getPillarColor(post.pillar) : null

  return (
    <button
      type="button"
      onClick={() => onClick(post)}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'relative w-full border-b border-line px-4 py-3 text-left',
        'transition-colors duration-150 ease-contour',
        'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-spring',
        // The active row is the post open in the dialog, so it keeps its tint under the
        // cursor and takes a Deep Pine edge that bounds it as one plate. Written as a
        // ternary because `hover:bg-sunken` and `bg-wash` are different variants and
        // both survived the merge: hovering the selected row turned it grey, so the one
        // row you were about to act on was the one row that stopped looking selected.
        isActive ? 'bg-wash ring-1 ring-inset ring-forest/[0.16]' : 'hover:bg-sunken'
      )}
    >
      {isActive && <ActiveBar />}

      <span className="mb-1 flex items-center gap-2">
        {pillar && (
          <span
            className="size-[7px] shrink-0 rounded-full"
            // The pillar's own hue, hashed off its name — a value, not a class pair.
            style={{ background: pillar.hex }}
          />
        )}
        <span className="truncate text-micro font-medium text-ink">{post.client_name}</span>
        {post.priority && (
          <span className="rounded-chip bg-pending-bg px-1.5 py-px text-micro font-medium text-pending">
            Priority
          </span>
        )}
        <span
          className={cn(
            'ml-auto shrink-0 text-micro font-medium',
            // Unjudged takes the neutral ink — it has not earned a verdict either way.
            score === null ? 'text-text3' : scoreTextColor(score)
          )}
        >
          {score === null ? 'Not scored' : `${score}/10`}
        </span>
      </span>

      <p className="mb-1 line-clamp-2 text-caption leading-snug text-ink">
        {post.topic_summary ?? post.caption ?? 'Untitled post'}
      </p>

      {post.topic_summary && <CaptionPreview caption={post.caption} />}

      <span className="flex items-center gap-1.5 text-micro text-text3">
        <span>{postTypeLabel(post.post_type, post.slides_json)}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">{formatRelativeTime(parseTimestamp(post.created_at))}</span>
      </span>
    </button>
  )
})

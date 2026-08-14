'use client'

import { memo } from 'react'
import { getClientTone } from '@/components/ui/colors/identity-colors'
import type { CalendarPost } from '@/types/api'

interface PostEventPillProps {
  post: CalendarPost
  onPostClick: (postId: string) => void
}

/**
 * Compact pill shown inside a day cell for a scheduled post.
 *
 * Derives its own colour rather than taking one: the tone is a pure function of the
 * client's name, so passing it down was three extra props and — because the parent
 * built the lookup as a fresh closure each render — a defeated `memo` on all 42 cells.
 */
export const PostEventPill = memo(function PostEventPill({
  post,
  onPostClick,
}: PostEventPillProps) {
  const tone = getClientTone(post.client_name)

  const statusDotColor =
    post.status === 'published'
      ? 'var(--spring-text)'
      : post.status === 'failed'
        ? 'var(--danger)'
        : post.status === 'publishing'
          ? 'var(--spring-text)'
          : tone.hex

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onPostClick(post.id)
      }}
      className="flex w-full shrink-0 cursor-pointer items-center gap-1 rounded-xs border-none px-1.5 py-0.5 text-left hover:opacity-75"
      // The client's tone is derived from its name, so it stays a value.
      // The easing shorthand has no exact utility — Tailwind's would retime it.
      style={{ background: tone.bg, transition: 'opacity 0.12s' }}
    >
      <span className="size-[5px] shrink-0 rounded-full" style={{ background: statusDotColor }} />
      {/* tracking-normal cancels the Label role's built-in 0.16em. */}
      <span
        className="flex-1 truncate text-label font-medium tracking-normal"
        style={{ color: tone.text }}
      >
        {truncateLabel(post)}
      </span>
    </button>
  )
})

function truncateLabel(post: CalendarPost): string {
  const label = post.pillar ?? post.client_name
  return label.length > 18 ? label.slice(0, 16) + '…' : label
}

'use client'

import { memo } from 'react'
import type { CalendarPost } from '@/types/api'

interface PostEventPillProps {
  post: CalendarPost
  onClick: () => void
  dotColor: string
  bgColor: string
  textColor: string
}

/** Compact pill shown inside a day cell for a scheduled post. */
export const PostEventPill = memo(function PostEventPill({ post, onClick, dotColor, bgColor, textColor }: PostEventPillProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        borderRadius: 4,
        cursor: 'pointer',
        flexShrink: 0,
        background: bgColor,
        border: 'none',
        width: '100%',
        textAlign: 'left',
        fontFamily: 'inherit',
        transition: 'opacity 0.12s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.75' }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: textColor,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
      >
        {truncateLabel(post)}
      </span>
    </button>
  )
})

function truncateLabel(post: CalendarPost): string {
  const label = post.pillar ?? post.client_name
  return label.length > 18 ? label.slice(0, 16) + '\u2026' : label
}

'use client'

import { memo } from 'react'
import { cn } from '@/utils/cn'
import { PostEventPill } from './post-event-pill'
import type { CalendarPost } from '@/types/api'

const MAX_VISIBLE = 2

interface DayCellProps {
  date: Date
  isToday: boolean
  isOtherMonth: boolean
  posts: CalendarPost[]
  onPostClick: (postId: string) => void
}

/**
 * Single day cell in the month grid.
 *
 * The cell itself is inert: it has no click, no cursor and no hover shadow. It used to
 * carry all three plus the full HTML5 drop protocol, and none of it did anything —
 * nothing in the app ever set `draggable` on a calendar element, and the click was
 * wired to a literal `noop`. The only thing droppable was stray selected text, which
 * the handler forwarded to a real `updatePost` as a post id.
 */
export const DayCell = memo(function DayCell({
  date,
  isToday: today,
  isOtherMonth,
  posts,
  onPostClick,
}: DayCellProps) {
  const dayNum = date.getDate()

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col gap-[3px] overflow-hidden rounded-md px-2 pb-1.5 pt-2',
        isOtherMonth ? 'bg-sunken' : 'bg-surface',
        // Today's ring is Living Green at 3.38:1 — it clears the 3:1 non-text
        // bar, where lime would be 1.35:1. The lime lives in the day plate below.
        today ? 'border-[1.5px] border-spring' : 'border border-line',
        isOtherMonth && 'opacity-45'
      )}
    >
      {/* Day number */}
      {today ? (
        // bg-accent is the field's lime: today's plate, carrying Pine Deep at
        // 10.87:1. Was spring under white text, which measured 3.38:1 and failed.
        // tracking-normal cancels the Label role's built-in 0.16em.
        <div className="mb-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-label font-medium tracking-normal text-forest-deep">
          {dayNum}
        </div>
      ) : (
        // leading-none: the number is one glyph sat on its own line, and Micro's
        // 1.35 would spend the cell's height on space the pills below need.
        <div
          className={cn(
            'mb-0.5 shrink-0 text-micro font-medium leading-none',
            isOtherMonth ? 'text-text3' : 'text-ink'
          )}
        >
          {dayNum}
        </div>
      )}

      {/* Post event pills */}
      {posts.slice(0, MAX_VISIBLE).map((post) => (
        <PostEventPill key={post.id} post={post} onPostClick={onPostClick} />
      ))}

      {/* Overflow badge */}
      {posts.length > MAX_VISIBLE && (
        // tracking-normal cancels the Label role's built-in 0.16em.
        <div className="self-start rounded-[3px] bg-sunken px-1 py-px text-label tracking-normal text-text2">
          +{posts.length - MAX_VISIBLE}
        </div>
      )}
    </div>
  )
})

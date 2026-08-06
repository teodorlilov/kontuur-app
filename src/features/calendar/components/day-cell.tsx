'use client'

import { memo, useState } from 'react'
import { cn } from '@/utils/cn'
import { toDateKey } from '@/utils/date-helpers'
import { PostEventPill } from './post-event-pill'
import type { CalendarPost } from '@/types/api'

const MAX_VISIBLE = 2

interface ClientStyle {
  dotColor: string
  bgColor: string
  textColor: string
}

interface DayCellProps {
  date: Date
  isToday: boolean
  isOtherMonth: boolean
  posts: CalendarPost[]
  onPostClick: (postId: string) => void
  onDayClick: (date: Date) => void
  onDrop: (postId: string, dateKey: string) => void
  getClientStyle: (clientId: string) => ClientStyle
}

/** Single day cell in the month grid. */
export const DayCell = memo(function DayCell({
  date,
  isToday: today,
  isOtherMonth,
  posts,
  onPostClick,
  onDayClick,
  onDrop,
  getClientStyle,
}: DayCellProps) {
  const [dragOver, setDragOver] = useState(false)

  const dayNum = date.getDate()
  // Same helper the parent grid keys this cell by, so the two cannot disagree.
  const dateKey = toDateKey(date)

  return (
    <div
      onClick={() => onDayClick(date)}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDragEnter={() => setDragOver(true)}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const postId = e.dataTransfer.getData('text/plain')
        if (postId) onDrop(postId, dateKey)
      }}
      className={cn(
        'flex min-h-0 cursor-pointer flex-col gap-[3px] overflow-hidden rounded-md px-2 pb-1.5 pt-2',
        'hover:shadow-[0_1px_6px_rgba(15,21,18,0.06)]',
        dragOver ? 'bg-wash' : isOtherMonth ? 'bg-sunken' : 'bg-surface',
        // Today's ring is Living Green at 3.38:1 — it clears the 3:1 non-text
        // bar, where lime would be 1.35:1. The lime lives in the day plate below.
        // Only the non-today ring warms on hover; today's stays put.
        today ? 'border-[1.5px] border-spring' : 'border border-line hover:border-line2',
        isOtherMonth && 'opacity-45'
      )}
      // The shorthand's default `ease` has no exact utility — Tailwind's
      // transition-* would swap in its own curve.
      style={{ transition: 'border-color 0.15s, box-shadow 0.15s' }}
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
      {posts.slice(0, MAX_VISIBLE).map((post) => {
        const style = getClientStyle(post.client_id)
        return <PostEventPill key={post.id} post={post} onPostClick={onPostClick} {...style} />
      })}

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

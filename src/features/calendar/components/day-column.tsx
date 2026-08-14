'use client'

import { memo, useState } from 'react'
import { cn } from '@/utils/cn'
import { PostCard } from './post-card'
import { GhostSlot } from './ghost-slot'
import type { LaneItem } from '@/features/calendar/lib/week-model'

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * One day of the week: a header, then a scrollable lane of everything on that day.
 *
 * The lane scrolls rather than truncating. The month grid's `MAX_VISIBLE = 2` plus an
 * inert `+N` badge left the third post on any day unreachable by mouse, keyboard and
 * screen reader; a column that scrolls has no such ceiling, which is most of the reason
 * the week is the working unit.
 */
export const DayColumn = memo(function DayColumn({
  dayKey,
  columnIndex,
  isToday,
  isPast,
  items,
  timeZone,
  isDropTarget,
  onPostClick,
  onSlotClick,
  onDropPost,
  onDragStateChange,
}: {
  dayKey: string
  columnIndex: number
  isToday: boolean
  isPast: boolean
  items: LaneItem[]
  timeZone: string
  /** A card is in flight and this column is not the one it came from. */
  isDropTarget: boolean
  onPostClick: (postId: string) => void
  onSlotClick: (slot: { clientName: string; at: string }) => void
  onDropPost: (postId: string, dayKey: string) => void
  onDragStateChange: (postId: string | null) => void
}) {
  const dayNumber = Number(dayKey.slice(8, 10))
  const label = DOW_LABELS[columnIndex] ?? ''
  const [isOver, setIsOver] = useState(false)

  return (
    <div
      role="gridcell"
      // Focusable so a quiet day is still a stop on the way across the week.
      tabIndex={-1}
      data-grid-column={columnIndex}
      aria-label={dayLabel(label, dayNumber, items)}
      // `preventDefault` on dragover is what makes a drop possible at all — without it
      // the browser refuses the drop and nothing fires. It is also the reason the
      // calendar's previous drop protocol looked complete and did nothing.
      onDragOver={(event) => {
        if (!isDropTarget) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setIsOver(true)
      }}
      // relatedTarget, not a bare leave: dragging across a card *inside* the column
      // fires dragleave on the column, and clearing on that flickers the highlight off
      // every time the pointer crosses a post.
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOver(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setIsOver(false)
        onDragStateChange(null)
        const postId = event.dataTransfer.getData('text/plain')
        if (postId) onDropPost(postId, dayKey)
      }}
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-lg border transition-colors duration-150 ease-contour',
        isPast ? 'bg-sunken' : 'bg-surface',
        // Living Green at 3.38:1 clears the 3:1 non-text bar; lime would be 1.35:1.
        // The lime is spent on the day plate below, where it carries dark ink.
        isToday ? 'border-spring' : 'border-line',
        // Where it can land, and where it is about to. Two weights, because "this is a
        // possible target" and "let go now" are different answers.
        isDropTarget && 'border-dashed border-line2',
        isOver && 'border-solid border-forest bg-wash'
      )}
    >
      <div
        className={cn(
          'flex flex-none items-center justify-between gap-1.5 border-b border-line px-2.5 py-2',
          // A tinted cap, so seven columns read as seven columns. A white column on
          // near-white paper separates by 1.05:1 and its hairline edge is 1.13:1 —
          // together not enough to draw a grid, which is why the header carries it.
          isToday ? 'bg-wash' : 'bg-sunken'
        )}
      >
        <span
          className={cn(
            'text-label font-semibold uppercase',
            isToday ? 'text-forest' : 'text-text3'
          )}
        >
          {label}
        </span>
        {isToday ? (
          // The Two Facts Rule: today is a plate *behind* the day number, so the lane
          // below stays free to say whether today is covered.
          <span className="grid size-5 place-items-center rounded-full bg-accent text-label font-semibold tracking-normal tabular-nums text-forest-deep shadow-[inset_0_0_0_1px_rgba(12,46,32,0.45)]">
            {dayNumber}
          </span>
        ) : (
          <span className="text-caption font-medium tabular-nums text-ink">{dayNumber}</span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
        {items.length === 0 ? (
          // The serif, rationed to editorial moments — an empty day is one of the few
          // places in the app shell that gets to speak rather than label.
          <p className="m-auto px-2 py-2.5 text-center font-display text-caption italic text-text3">
            Quiet
          </p>
        ) : (
          items.map((item) =>
            item.kind === 'post' ? (
              <PostCard
                key={item.post.id}
                post={item.post}
                timeZone={timeZone}
                onClick={onPostClick}
                onDragStateChange={onDragStateChange}
              />
            ) : (
              <GhostSlot
                key={`${item.clientId}-${item.at}`}
                clientName={item.clientName}
                at={item.at}
                missed={item.missed}
                timeZone={timeZone}
                onClick={onSlotClick}
              />
            )
          )
        )}
      </div>
    </div>
  )
})

/** What a screen reader hears for the column as a whole, before entering it. */
function dayLabel(weekday: string, dayNumber: number, items: LaneItem[]): string {
  const posts = items.filter((i) => i.kind === 'post').length
  const open = items.filter((i) => i.kind === 'slot' && !i.missed).length
  const parts = [`${posts} ${posts === 1 ? 'post' : 'posts'}`]
  if (open > 0) parts.push(`${open} suggested ${open === 1 ? 'slot' : 'slots'} open`)
  return `${weekday} ${dayNumber}, ${parts.join(', ')}`
}

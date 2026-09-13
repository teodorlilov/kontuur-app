'use client'

import { memo, useMemo, useState } from 'react'
import { cn } from '@/utils/cn'
import { DayCap } from '@/components/ui/day-cap'
import { PostCard } from './post-card'
import { WEEKDAY_LABELS_SHORT as DOW_LABELS } from '@/utils/constants'
import type { LaneItem } from '@/features/calendar/lib/week-model'

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
  activeRow,
  onPostClick,
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
  /**
   * Which of this column's focusable items answers to Tab, or -1 when the grid's single
   * tab stop is in another column.
   */
  activeRow: number
  onPostClick: (postId: string) => void
  onDropPost: (postId: string, dayKey: string) => void
  onDragStateChange: (postId: string | null) => void
}) {
  const dayNumber = Number(dayKey.slice(8, 10))
  const label = DOW_LABELS[columnIndex] ?? ''
  const [isOver, setIsOver] = useState(false)

  /**
   * Each item's row among the column's `[data-grid-cell]` list, which is what the
   * navigation hook counts against.
   *
   * The identity mapping now that every lane item is a focusable card. It was a filtered
   * sequence while lanes could also hold a passed suggestion, which rendered as a record
   * rather than a control and had to be skipped; deriving the two lists from different
   * sequences is how Tab would land on a card the arrows think is somewhere else.
   */
  const rowOf = useMemo(() => items.map((_, index) => index), [items])
  const focusableCount = items.length
  // Clamped, because the active row travels across columns of different heights — the
  // same clamp `focusCell` applies when it moves focus there.
  const tabRow = activeRow < 0 ? -1 : Math.min(activeRow, focusableCount - 1)

  return (
    <div
      role="gridcell"
      // Focusable only when it is the tab stop and has nothing inside to be one: a quiet
      // day still has to be reachable, but a day holding cards defers to them.
      tabIndex={activeRow >= 0 && focusableCount === 0 ? 0 : -1}
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
        // Every lane is Surface white, past or not. The week used to sink passed days to
        // --sunken, which made the grid read as two materials — three columns of grey
        // paper beside four of white — with the seam moving one column every midnight.
        // Time is carried by the header's ink instead, where it costs no ground.
        'flex min-h-0 flex-col overflow-hidden rounded-lg border bg-surface transition-colors duration-150 ease-contour',
        // Living Green at 3.38:1 clears the 3:1 non-text bar; lime would be 1.35:1.
        // The lime is spent on the day plate below, where it carries dark ink.
        isToday ? 'border-spring' : 'border-line',
        // Where it can land, and where it is about to. Two weights, because "this is a
        // possible target" and "let go now" are different answers.
        isDropTarget && 'border-dashed border-line2',
        isOver && 'border-solid border-forest bg-wash'
      )}
    >
      <DayCap label={label} dayNumber={dayNumber} isToday={isToday} isPast={isPast} />

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
        {items.length === 0 ? (
          // The serif, rationed to editorial moments — an empty day is one of the few
          // places in the app shell that gets to speak rather than label.
          <p className="m-auto px-2 py-2.5 text-center font-display text-caption italic text-text3">
            Quiet
          </p>
        ) : (
          items.map((item, index) => (
            <PostCard
              key={item.post.id}
              post={item.post}
              timeZone={timeZone}
              tabIndex={rowOf[index] === tabRow ? 0 : -1}
              onClick={onPostClick}
              onDragStateChange={onDragStateChange}
            />
          ))
        )}
      </div>
    </div>
  )
})

/**
 * What a screen reader hears for the column as a whole, before entering it.
 *
 * The count is spoken here so the keyboard learns how much a column holds before paging
 * through it — the cards inside carry their own labels, not a total.
 */
function dayLabel(weekday: string, dayNumber: number, items: LaneItem[]): string {
  return `${weekday} ${dayNumber}, ${items.length} ${items.length === 1 ? 'post' : 'posts'}`
}

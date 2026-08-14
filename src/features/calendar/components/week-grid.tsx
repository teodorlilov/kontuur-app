'use client'

import { memo, useMemo, useState } from 'react'
import { getWeekDayKeys, toDateKey } from '@/utils/date-helpers'
import { DAYS_PER_WEEK } from '@/utils/constants'
import { buildWeekLanes, type LaneClient } from '@/features/calendar/lib/week-model'
import { useGridNavigation } from '@/features/calendar/hooks/use-grid-navigation'
import { DayColumn } from './day-column'
import { AgendaList } from './agenda-list'
import type { CalendarPost } from '@/types/api'

/**
 * The week as seven full-height columns.
 *
 * Below `md` it becomes an agenda instead of shrinking: seven columns at 375px gives
 * 43.6px each, and the month grid's `overflow: hidden` destroyed the excess rather than
 * scrolling it — which also fails reflow at 200% desktop zoom.
 */
export const WeekGrid = memo(function WeekGrid({
  weekStartISO,
  scheduledPosts,
  clients,
  timeZone,
  onPostClick,
  onSlotClick,
  onMovePost,
  onDropPost,
}: {
  weekStartISO: string
  scheduledPosts: CalendarPost[]
  clients: LaneClient[]
  timeZone: string
  onPostClick: (postId: string) => void
  onSlotClick: (slot: { clientId: string; clientName: string; at: string }) => void
  /** Move the focused post by whole days. Negative is earlier. */
  onMovePost: (postId: string, days: number) => void
  /** Drop the dragged post onto a named day. */
  onDropPost: (postId: string, dayKey: string) => void
}) {
  const dayKeys = useMemo(() => getWeekDayKeys(weekStartISO), [weekStartISO])
  // `now` is read once per render rather than inside the builder, so every slot in a
  // pass agrees about which side of the present it sits on.
  const lanes = useMemo(
    () =>
      buildWeekLanes({
        posts: scheduledPosts,
        clients,
        weekStartISO,
        timeZone,
        now: new Date(),
      }),
    [scheduledPosts, clients, weekStartISO, timeZone]
  )
  const todayKey = useMemo(() => toDateKey(new Date(), timeZone), [timeZone])
  const { gridRef, onKeyDown, onFocus, activeColumn, activeRow } = useGridNavigation(DAYS_PER_WEEK)
  // Which post is in flight, so every day but its own can offer itself as a target.
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const draggingFromDay = draggingId
    ? [...lanes.entries()].find(([, items]) =>
        items.some((item) => item.kind === 'post' && item.post.id === draggingId)
      )?.[0]
    : null

  /**
   * Alt+Left/Right moves the focused post a day; a bare arrow moves the focus.
   *
   * WCAG 2.5.7 requires a non-dragging path to anything drag can do, and this is it —
   * built first deliberately, so a later drop handler calls the same command instead of
   * growing its own date maths. The last pair drifted immediately: the deleted drop
   * handler hardcoded noon and threw away the hour the post was set for.
   *
   * Read off the focused element rather than passed down, so no handler has to be
   * threaded through seven lanes and every card in them.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-post-id]')
      const postId = cell?.dataset.postId
      if (postId) {
        event.preventDefault()
        onMovePost(postId, event.key === 'ArrowRight' ? 1 : -1)
        return
      }
    }
    onKeyDown(event)
  }

  return (
    <>
      <div
        ref={gridRef}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        role="grid"
        aria-label="Week"
        className="hidden min-h-0 flex-1 grid-cols-7 gap-1.5 md:grid"
      >
        {/* `role="grid"` requires rows between the grid and its cells; the seven columns
            were `gridcell` children of `grid` directly, which is a structure no assistive
            technology is obliged to make sense of. `display: contents` gives the row its
            place in the accessibility tree while leaving the seven columns as the CSS
            grid's own children, so the layout is byte-identical. */}
        <div role="row" className="contents">
          {dayKeys.map((dayKey, index) => (
            <DayColumn
              key={dayKey}
              dayKey={dayKey}
              columnIndex={index}
              isToday={dayKey === todayKey}
              isPast={dayKey < todayKey}
              items={lanes.get(dayKey) ?? []}
              timeZone={timeZone}
              isDropTarget={draggingId !== null && dayKey !== draggingFromDay}
              // -1 in every column but the one holding the grid's single tab stop.
              activeRow={activeColumn === index ? activeRow : -1}
              onPostClick={onPostClick}
              onSlotClick={onSlotClick}
              onDropPost={onDropPost}
              onDragStateChange={setDraggingId}
            />
          ))}
        </div>
      </div>

      <AgendaList
        dayKeys={dayKeys}
        lanes={lanes}
        todayKey={todayKey}
        timeZone={timeZone}
        onPostClick={onPostClick}
        onSlotClick={onSlotClick}
      />
    </>
  )
})

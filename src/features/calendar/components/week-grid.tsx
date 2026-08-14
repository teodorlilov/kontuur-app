'use client'

import { memo, useMemo } from 'react'
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
}: {
  weekStartISO: string
  scheduledPosts: CalendarPost[]
  clients: LaneClient[]
  timeZone: string
  onPostClick: (postId: string) => void
  onSlotClick: (slot: { clientName: string; at: string }) => void
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
  const { gridRef, onKeyDown } = useGridNavigation(DAYS_PER_WEEK)

  return (
    <>
      <div
        ref={gridRef}
        onKeyDown={onKeyDown}
        role="grid"
        aria-label="Week"
        className="hidden min-h-0 flex-1 grid-cols-7 gap-1.5 md:grid"
      >
        {dayKeys.map((dayKey, index) => (
          <DayColumn
            key={dayKey}
            dayKey={dayKey}
            columnIndex={index}
            isToday={dayKey === todayKey}
            isPast={dayKey < todayKey}
            items={lanes.get(dayKey) ?? []}
            timeZone={timeZone}
            onPostClick={onPostClick}
            onSlotClick={onSlotClick}
          />
        ))}
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

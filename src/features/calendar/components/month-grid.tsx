'use client'

import { memo, useMemo } from 'react'
import { DayCell } from './day-cell'
import { getDaysInMonth, isSameMonth } from '@/features/calendar/lib/calendar-range'
import { groupPostsByDate } from '@/features/calendar/lib/week-model'
import { toDateKey } from '@/utils/date-helpers'
import type { CalendarPost } from '@/types/api'

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface MonthGridProps {
  year: number
  month: number
  /** The agency zone. Bucketing and "today" must both resolve in it, or a post near
   *  midnight renders in a cell the header disagrees with. */
  timeZone: string
  scheduledPosts: CalendarPost[]
  onPostClick: (postId: string) => void
}

/** Full-height month calendar grid with coloured post pills. */
export const MonthGrid = memo(function MonthGrid({
  year,
  month,
  timeZone,
  scheduledPosts,
  onPostClick,
}: MonthGridProps) {
  const days = useMemo(() => getDaysInMonth(year, month), [year, month])
  const postsByDate = useMemo(
    () => groupPostsByDate(scheduledPosts, timeZone),
    [scheduledPosts, timeZone]
  )
  const todayKey = useMemo(() => toDateKey(new Date(), timeZone), [timeZone])


  return (
    // No padding here: the view wrapper in CalendarView owns it, so all three views
    // sit on the same gutters. min-h-0 so the 42-cell grid is bounded by the workspace
    // rather than growing it.
    // min-h on mobile because the page is a scroll column there: six rows of
    // `auto-rows-[1fr]` in an unbounded parent would resolve to nothing.
    <div className="flex min-h-[480px] flex-col overflow-hidden md:min-h-0 md:flex-1">
      {/* Day headers */}
      {/* grid-cols-[repeat(7,1fr)], not grid-cols-7: the shorthand floors each
          track at min-content, which would let a long pill widen its column. */}
      <div className="grid shrink-0 grid-cols-[repeat(7,1fr)] pb-1 pt-[5px]">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-center text-label font-semibold uppercase text-text2">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid min-h-0 flex-1 auto-rows-[1fr] grid-cols-[repeat(7,1fr)] gap-[5px]">
        {days.map((day) => {
          // Deliberately UNZONED, unlike the two above. `getDaysInMonth` builds these
          // with `new Date(year, month, d)` — local midnight standing for "the 6th",
          // not an instant. Reading it back locally round-trips to the 6th on any
          // runtime; reading it in the agency zone would shift it to the 5th or 7th.
          // The zone belongs to the post instants, which is where it now is.
          const key = toDateKey(day)
          const dayPosts = postsByDate.get(key) ?? []
          return (
            <DayCell
              key={key}
              date={day}
              isToday={key === todayKey}
              isOtherMonth={!isSameMonth(day, month, year)}
              posts={dayPosts}
              onPostClick={onPostClick}
            />
          )
        })}
      </div>
    </div>
  )
})

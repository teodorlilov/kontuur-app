'use client'

import { memo, useMemo } from 'react'
import { DayCell } from './day-cell'
import {
  getDaysInMonth,
  groupPostsByDate,
  getTodayKey,
  isSameMonth,
} from '@/features/calendar/helpers'
import { toDateKey } from '@/utils/date-helpers'
import { CLIENT_PILL_TONES } from '@/utils/constants'
import type { CalendarPost } from '@/types/api'

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface MonthGridProps {
  year: number
  month: number
  scheduledPosts: CalendarPost[]
  onPostClick: (postId: string) => void
  onDayClick: (date: Date) => void
  onDrop: (postId: string, dateKey: string) => void
}

/** Full-height month calendar grid with coloured post pills. */
export const MonthGrid = memo(function MonthGrid({
  year,
  month,
  scheduledPosts,
  onPostClick,
  onDayClick,
  onDrop,
}: MonthGridProps) {
  const days = useMemo(() => getDaysInMonth(year, month), [year, month])
  const postsByDate = useMemo(() => groupPostsByDate(scheduledPosts), [scheduledPosts])
  const todayKey = useMemo(() => getTodayKey(), [])

  const clientStyleMap = useMemo(() => {
    const ids = [...new Set(scheduledPosts.map((p) => p.client_id))].sort()
    const map = new Map<string, number>()
    ids.forEach((id, i) => map.set(id, i))
    return map
  }, [scheduledPosts])

  function getClientStyle(clientId: string) {
    const idx = clientStyleMap.get(clientId) ?? 0
    return CLIENT_PILL_TONES[idx % CLIENT_PILL_TONES.length]!
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden px-2 pb-[18px] pt-2.5 md:px-[18px]">
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
              onDayClick={onDayClick}
              onDrop={onDrop}
              getClientStyle={getClientStyle}
            />
          )
        })}
      </div>
    </div>
  )
})

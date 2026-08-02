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
    <div
      className="px-2 md:px-[18px]"
      style={{
        flex: 1,
        paddingTop: 10,
        paddingBottom: 18,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Day headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          padding: '5px 0 4px',
          flexShrink: 0,
        }}
      >
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="text-label font-semibold uppercase text-text2"
            style={{ textAlign: 'center' }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridAutoRows: '1fr',
          gap: 5,
          flex: 1,
          minHeight: 0,
        }}
      >
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

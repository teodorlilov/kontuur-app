'use client'

import { memo, useMemo } from 'react'
import { DayCell } from './day-cell'
import {
  getDaysInMonth,
  toDateKey,
  groupPostsByDate,
  getTodayKey,
  isSameMonth,
} from '@/features/calendar/helpers'
import type { CalendarPost } from '@/types/api'

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Pill colour palette — cycles for unknown clients. */
const PALETTE = [
  { dotColor: '#C07B55', bgColor: 'rgba(192,123,85,0.12)', textColor: '#7A3A25' },
  { dotColor: '#2C5F8A', bgColor: 'rgba(44,94,138,0.12)', textColor: '#1A3D5A' },
  { dotColor: '#5A8A4A', bgColor: 'rgba(90,138,74,0.12)', textColor: '#2A5A1A' },
  { dotColor: '#854F0B', bgColor: 'rgba(133,79,11,0.12)', textColor: '#5A2A00' },
  { dotColor: '#7C3AED', bgColor: 'rgba(124,58,237,0.12)', textColor: '#4C1D95' },
  { dotColor: '#0891B2', bgColor: 'rgba(8,145,178,0.12)', textColor: '#155E75' },
]

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
    return PALETTE[idx % PALETTE.length]!
  }

  return (
    <div
      style={{
        flex: 1,
        padding: '10px 18px 18px',
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
            style={{
              textAlign: 'center',
              fontSize: 9,
              fontWeight: 500,
              color: 'var(--color-muted)',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}
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

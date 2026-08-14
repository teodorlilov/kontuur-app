'use client'

import { cn } from '@/utils/cn'
import { getWeekDayKeys, toDateKey } from '@/utils/date-helpers'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export interface WeekStripProps {
  /** Monday of the shown week, YYYY-MM-DD. */
  weekStart: string
  /** Scheduled-post count per day, Monday-first, length 7. */
  countsByDay: number[]
  /** The client's posts-per-week target; 0 hides the meta line. */
  target: number
  /** The agency zone. "Today" must be theirs, not the operator's browser. */
  timeZone: string
}

/**
 * The client's week at approve time: which days already carry a post and how
 * the week stands against the posts-per-week target. Deep Pine dots for
 * filled days; today is named by Living Green (the small "now" mark on light).
 */
export function WeekStrip({ weekStart, countsByDay, target, timeZone }: WeekStripProps) {
  const todayKey = toDateKey(new Date(), timeZone)
  const dayKeys = getWeekDayKeys(weekStart)
  const placed = countsByDay.reduce((sum, count) => sum + count, 0)

  return (
    <div className="rounded-chip border border-line bg-paper px-4 py-3">
      <div className="flex justify-between">
        {dayKeys.map((key, index) => {
          const filled = (countsByDay[index] ?? 0) > 0
          const isToday = key === todayKey
          return (
            <span key={key} className="flex w-9 flex-col items-center gap-1.5">
              <span
                className={cn(
                  'text-label font-semibold uppercase',
                  isToday ? 'text-spring-text' : 'text-text3'
                )}
              >
                {DAY_LABELS[index]}
              </span>
              <span
                className={cn(
                  'text-caption font-semibold tabular-nums',
                  isToday ? 'text-spring-text' : 'text-ink'
                )}
              >
                {Number(key.slice(8, 10))}
              </span>
              <span
                aria-hidden
                className={cn(
                  'size-2 rounded-full',
                  filled ? 'bg-forest' : 'border border-line2 bg-transparent'
                )}
              />
            </span>
          )
        })}
      </div>
      {target > 0 && (
        <p className="mt-2.5 text-micro text-text2">
          <span className="font-semibold tabular-nums text-ink">
            {placed} of {target}
          </span>{' '}
          weekly posts placed
        </p>
      )}
    </div>
  )
}

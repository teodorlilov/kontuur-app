'use client'

import { memo, useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import { getDaysInMonth, isSameMonth, type WeekView } from '@/features/calendar/lib/calendar-range'
import { COVERAGE_INK, COVERAGE_TONE } from '@/features/calendar/lib/coverage-tone'
import { groupPostsByDate, strongestState } from '@/features/calendar/lib/week-model'
import { DAYS_PER_WEEK } from '@/utils/constants'
import { getMondayISO, toDateKey } from '@/utils/date-helpers'
import type { CalendarPost } from '@/types/api'

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** A gutter cell, then seven days. One template, shared by the header and every row. */
const MONTH_GRID = 'grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-1'

interface MonthDay {
  /** The zoned day key, and what a click resolves its week from. */
  key: string
  number: number
  isOtherMonth: boolean
  isToday: boolean
  count: number
  state: ReturnType<typeof strongestState>
}

/**
 * The month, demoted from a working surface to an overview.
 *
 * It used to try to be a small week: two post pills per day and a `+N` badge for the
 * rest — a badge that was a bare `<div>`, so the third post on any day was unreachable
 * by mouse, keyboard and screen reader. Six weeks of 43px columns cannot hold posts, and
 * the attempt is what made the month both unusable and redundant.
 *
 * So it answers a different question: **where is the month full, and where is it
 * empty**. Every day is a coverage cell in the same vocabulary the Clients tab uses,
 * carrying its date and how many posts sit on it. Nothing here opens a post; every
 * target opens the *week*, which is where posts are worked on.
 *
 * States are `none`/`scheduled`/`published`/`failed` only. Open and missed slots are the
 * deficit question, and answering it needs a per-client target — that is the Clients
 * tab, and deriving six weeks of suggestions for every client to shade a month would
 * cost more than the answer is worth here.
 */
export const MonthCoverage = memo(function MonthCoverage({
  year,
  month,
  timeZone,
  scheduledPosts,
  onSelectWeek,
}: {
  year: number
  month: number
  /** The agency zone. Bucketing and "today" must both resolve in it, or a post near
   *  midnight lands in a cell the date disagrees with. */
  timeZone: string
  scheduledPosts: CalendarPost[]
  onSelectWeek: (weekStartISO: WeekView) => void
}) {
  const postsByDate = useMemo(
    () => groupPostsByDate(scheduledPosts, timeZone),
    [scheduledPosts, timeZone]
  )

  const weeks = useMemo(() => {
    const todayKey = toDateKey(new Date(), timeZone)
    const days: MonthDay[] = getDaysInMonth(year, month).map((day) => {
      // Deliberately UNZONED, unlike `todayKey`. `getDaysInMonth` builds these with
      // `new Date(year, month, d)` — local midnight standing for "the 6th", not an
      // instant. Reading it back locally round-trips to the 6th on any runtime; reading
      // it in the agency zone would shift it to the 5th or the 7th.
      const key = toDateKey(day)
      const posts = postsByDate.get(key) ?? []
      return {
        key,
        number: day.getDate(),
        isOtherMonth: !isSameMonth(day, month, year),
        isToday: key === todayKey,
        count: posts.length,
        state: strongestState(posts),
      }
    })

    const rows: MonthDay[][] = []
    for (let i = 0; i < days.length; i += DAYS_PER_WEEK) {
      rows.push(days.slice(i, i + DAYS_PER_WEEK))
    }
    return rows
  }, [year, month, postsByDate, timeZone])

  return (
    <div className="flex min-h-[480px] flex-col gap-1 md:min-h-0 md:flex-1">
      <div className={cn(MONTH_GRID, 'shrink-0 pb-0.5')}>
        <span aria-hidden="true" />
        {DAY_HEADERS.map((day) => (
          <span key={day} className="text-center text-label font-semibold uppercase text-text3">
            {day}
          </span>
        ))}
      </div>

      {weeks.map((week) => {
        // The row's Monday, resolved from a day key rather than counted from the first
        // of the month: the grid is padded, so row 0 usually starts in the month before.
        const weekStart = getMondayISO(new Date(`${week[0]!.key}T12:00:00Z`), 'UTC')
        const total = week.reduce((sum, day) => sum + day.count, 0)

        return (
          <div key={weekStart} className={cn(MONTH_GRID, 'min-h-0 flex-1')}>
            <button
              type="button"
              onClick={() => onSelectWeek(weekStart)}
              aria-label={`Open the week of ${weekStart}, ${total} ${total === 1 ? 'post' : 'posts'}`}
              className={cn(
                'group flex flex-col items-center justify-center gap-0.5 rounded-sm border border-line bg-surface',
                'transition-colors duration-150 ease-contour hover:border-forest hover:bg-wash',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-spring'
              )}
            >
              <span
                className={cn(
                  'text-caption font-semibold tabular-nums',
                  total === 0 ? 'text-text3' : 'text-ink'
                )}
              >
                {total}
              </span>
              <ChevronRight
                aria-hidden="true"
                className="size-3 text-text3 transition-colors duration-150 ease-contour group-hover:text-forest"
              />
            </button>

            {week.map((day) => (
              <button
                key={day.key}
                type="button"
                onClick={() => onSelectWeek(weekStart)}
                aria-label={dayLabel(day)}
                className={cn(
                  'flex min-w-0 flex-col items-start justify-between rounded-sm p-1.5 text-left',
                  'transition-opacity duration-150 ease-contour hover:opacity-80',
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-spring',
                  COVERAGE_TONE[day.state],
                  // Padding days are context, not content. They keep their state so a
                  // busy first week still reads as busy, at a weight that says the
                  // month does not own them.
                  day.isOtherMonth && 'opacity-45'
                )}
              >
                <span
                  className={cn(
                    'text-micro font-medium tabular-nums',
                    COVERAGE_INK[day.state],
                    // The Two Facts Rule: today is a plate behind the *date*, so the
                    // cell's own fill is left free to say whether today is covered.
                    day.isToday &&
                      'rounded-full bg-accent px-1.5 text-forest-deep shadow-[inset_0_0_0_1px_rgba(12,46,32,0.45)]'
                  )}
                >
                  {day.number}
                </span>
                {day.count > 0 && (
                  <span
                    className={cn('text-caption font-semibold tabular-nums', COVERAGE_INK[day.state])}
                  >
                    {day.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
})

/** What a screen reader hears, since the cell's own fill is the visual half. */
function dayLabel(day: MonthDay): string {
  const posts = day.count === 0 ? 'nothing scheduled' : `${day.count} ${day.count === 1 ? 'post' : 'posts'}`
  return `${day.number}${day.isToday ? ', today' : ''}, ${posts}. Open this week`
}

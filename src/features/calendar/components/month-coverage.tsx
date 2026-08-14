'use client'

import { memo, useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import { getClientTone } from '@/components/ui/colors/identity-colors'
import { getDaysInMonth, isSameMonth, type WeekView } from '@/features/calendar/lib/calendar-range'
import { COVERAGE_INK, COVERAGE_TONE } from '@/features/calendar/lib/coverage-tone'
import { groupPostsByDate, strongestState } from '@/features/calendar/lib/week-model'
import { DAYS_PER_WEEK, WEEKDAY_LABELS_SHORT as DAY_HEADERS } from '@/utils/constants'
import { getMondayISO, isoToDateTimeFields, toDateKey } from '@/utils/date-helpers'
import { extractInitials, pluralise } from '@/utils/format'
import type { CalendarPost } from '@/types/api'

/** A gutter cell, then seven days. One template, shared by the header and every row. */
const MONTH_GRID = 'grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-1'

/**
 * How many posts a cell lists before it stops.
 *
 * Three, not two. The month grid this replaces showed two and hid the rest behind a `+N`
 * badge that was a bare `<div>` — unreachable by mouse, keyboard and screen reader — so
 * the third post on any day existed nowhere a human could get to it. The overflow here is
 * a real button, and it goes somewhere: the week that holds them.
 */
const MAX_VISIBLE = 3

interface MonthDay {
  key: string
  number: number
  isOtherMonth: boolean
  isToday: boolean
  posts: CalendarPost[]
}

/**
 * The month: six weeks of days, each listing what is actually on it.
 *
 * It was counts in coloured boxes — one tone and one number per day, which says a day is
 * busy without saying with what, and collapses seventeen clients into a single fill. A
 * month of squares answers no question the week does not answer better.
 *
 * So each day lists its posts as time plus client, which is the pair that distinguishes
 * them at this density: the title belongs to the week view, but *when* and *whose* is
 * exactly what you scan a month for. The state tone moves onto the individual rows rather
 * than flooding the cell, so one failure no longer paints a day that also published three
 * posts fine.
 *
 * Still not a working surface — nothing is dragged here and nothing is edited. Clicking a
 * post opens it; clicking anything else opens the week that holds it.
 */
export const MonthCoverage = memo(function MonthCoverage({
  year,
  month,
  timeZone,
  scheduledPosts,
  onPostClick,
  onSelectWeek,
}: {
  year: number
  month: number
  /** The agency zone. Bucketing, "today" and every printed hour resolve in it. */
  timeZone: string
  scheduledPosts: CalendarPost[]
  onPostClick: (postId: string) => void
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
      return {
        key,
        number: day.getDate(),
        isOtherMonth: !isSameMonth(day, month, year),
        isToday: key === todayKey,
        posts: postsByDate.get(key) ?? [],
      }
    })

    const rows: MonthDay[][] = []
    for (let i = 0; i < days.length; i += DAYS_PER_WEEK) {
      rows.push(days.slice(i, i + DAYS_PER_WEEK))
    }
    return rows
  }, [year, month, postsByDate, timeZone])

  return (
    <div className="flex min-h-[520px] flex-col gap-1 md:min-h-0 md:flex-1">
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
        const total = week.reduce((sum, day) => sum + day.posts.length, 0)

        return (
          <div key={weekStart} className={cn(MONTH_GRID, 'min-h-0 flex-1')}>
            <button
              type="button"
              onClick={() => onSelectWeek(weekStart)}
              aria-label={`Open the week of ${weekStart}, ${pluralise(total, 'post')}`}
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
              <DayCell
                key={day.key}
                day={day}
                weekStart={weekStart}
                timeZone={timeZone}
                onPostClick={onPostClick}
                onSelectWeek={onSelectWeek}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
})

/**
 * One day: its date, and up to three of its posts.
 *
 * A `div`, not a button, because it contains buttons — the date opens the week and each
 * post opens itself, and nesting those inside one clickable cell is invalid markup that
 * swallows the inner target's keyboard access.
 */
function DayCell({
  day,
  weekStart,
  timeZone,
  onPostClick,
  onSelectWeek,
}: {
  day: MonthDay
  weekStart: WeekView
  timeZone: string
  onPostClick: (postId: string) => void
  onSelectWeek: (weekStartISO: WeekView) => void
}) {
  const hidden = day.posts.length - MAX_VISIBLE

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1 overflow-hidden rounded-sm border p-1.5',
        day.isOtherMonth ? 'border-line/60 bg-sunken/60' : 'border-line bg-surface',
        // Padding days are context, not content — legible, at a weight that says the
        // month does not own them.
        day.isOtherMonth && 'opacity-70'
      )}
    >
      <button
        type="button"
        onClick={() => onSelectWeek(weekStart)}
        aria-label={`${day.number}${day.isToday ? ', today' : ''}, ${pluralise(day.posts.length, 'post')}. Open this week`}
        className={cn(
          'self-start rounded-full px-1.5 text-micro font-medium tabular-nums',
          'transition-colors duration-150 ease-contour',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-spring',
          // The Two Facts Rule: today is a plate behind the *date*, leaving each post row
          // free to say whether it went out.
          day.isToday
            ? 'bg-accent text-forest-deep shadow-[inset_0_0_0_1px_rgba(12,46,32,0.45)]'
            : 'text-text2 hover:bg-ink/[0.06] hover:text-ink'
        )}
      >
        {day.number}
      </button>

      {day.posts.slice(0, MAX_VISIBLE).map((post) => (
        <PostLine key={post.id} post={post} timeZone={timeZone} onClick={onPostClick} />
      ))}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => onSelectWeek(weekStart)}
          className={cn(
            'self-start rounded-xs px-1 text-micro font-medium text-text3',
            'transition-colors duration-150 ease-contour hover:bg-ink/[0.06] hover:text-ink',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-spring'
          )}
        >
          +{hidden} more
        </button>
      )}
    </div>
  )
}

/**
 * One post, at month density: when, and whose.
 *
 * Two channels for two facts. The row's fill is the **state**, taken from the same map
 * the coverage strip uses so the month and the Clients tab cannot disagree about what
 * published looks like; the initials take the **client's** hue, which is the one thing
 * DESIGN.md lets identity colour encode.
 */
function PostLine({
  post,
  timeZone,
  onClick,
}: {
  post: CalendarPost
  timeZone: string
  onClick: (postId: string) => void
}) {
  const state = strongestState([post])
  const tone = getClientTone(post.client_name)
  const time = post.scheduled_at ? isoToDateTimeFields(post.scheduled_at, timeZone).time : ''

  return (
    <button
      type="button"
      onClick={() => onClick(post.id)}
      title={`${time} · ${post.client_name}`}
      aria-label={`${time}, ${post.client_name}, ${state}`}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-xs px-1 py-px text-left',
        'transition-opacity duration-150 ease-contour hover:opacity-80',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-spring',
        COVERAGE_TONE[state]
      )}
    >
      <span
        className={cn(
          'flex-none text-label font-semibold tracking-normal tabular-nums',
          COVERAGE_INK[state]
        )}
      >
        {time}
      </span>
      <span
        className="truncate text-label font-semibold tracking-normal"
        // Identity, hashed off the name — the same hue this client wears everywhere.
        // Solid ink rather than a tint, because it sits on a state fill already.
        style={{ color: state === 'published' ? undefined : tone.text }}
      >
        {extractInitials(post.client_name)}
      </span>
    </button>
  )
}

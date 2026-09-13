import Link from 'next/link'
import { CalendarIcon } from '@solar-icons/react/line-duotone'
import { Card } from '@/components/ui/card'
import { DayCap } from '@/components/ui/day-cap'
import { Icon } from '@/components/ui/icon'
import { SectionHeading } from '@/components/ui/section-heading'
import { CoverageLegend } from '@/features/dashboard/components/coverage-legend'
import { PostThumbnail } from '@/features/dashboard/components/post-thumbnail'
import { DAY_STATE_CLASSES } from '@/features/dashboard/lib/day-state-classes'
import { COVERAGE_LIST_HEIGHT } from '@/features/dashboard/lib/layout'
import { countWeek, describeWeek } from '@/features/dashboard/lib/metrics'
import type { MyWeekDay } from '@/features/dashboard/lib/my-week'
import { cn } from '@/utils/cn'
import type { WeekDay } from '@/lib/queries/week-coverage'

interface MyWeekCardProps {
  days: MyWeekDay[]
  week: WeekDay[]
  /** Whose posts these are; the thumbnail's fallback initial. */
  clientName: string
}

/**
 * A solo user's week as seven columns in the calendar's own language: the day cap, then the lane
 * — the day's post, or the hatched open slot with one way to fill it.
 *
 * The day grid reserves the same row area the drafts card beside it reserves
 * (`COVERAGE_LIST_HEIGHT`), so the two columns agree on height by construction rather than by a
 * second number; the grid's rows stretch to fill it, so an open cell is never taller than an
 * occupied one (DESIGN.md, Two Facts Rule's corollary) and a week of nothing stands as tall as a
 * full one. The thumbnail has a fixed height rather than an aspect ratio for the same reason: a
 * post card must fit the lane, not grow the row past its neighbour. The time sits in the Label role with `tracking-normal`: 0.16em on a
 * five-glyph numeral is trailing space (DESIGN.md § Label). The card's ground is the same three
 * words the legend swatches use; published adds white ink on the pine. A post links to the
 * calendar's `?editPost=` deep link, the one the dashboard already uses; an open day to the
 * calendar itself — `?week=` only sizes the loaded window, and the view opens on today anyway.
 * The footer says how many days are still open, not "N of 7 covered": the dark stat card above
 * already says that, from the same one client. The chips are a graphic, so the same week is
 * stated once in words for anyone who cannot see them.
 */
export function MyWeekCard({ days, week, clientName }: MyWeekCardProps) {
  const { open } = countWeek(week)

  return (
    <Card className="px-5 py-[18px]">
      <div className="flex items-center justify-between gap-3">
        <SectionHeading icon={<Icon glyph={CalendarIcon} size="sm" />}>My week</SectionHeading>
        <CoverageLegend />
      </div>

      <p className="sr-only">{describeWeek(week)}</p>

      <ul className="mt-3 grid grid-cols-7 gap-1.5" style={{ minHeight: COVERAGE_LIST_HEIGHT }}>
        {days.map((day) => (
          <li
            key={day.key}
            className={cn(
              'flex flex-col overflow-hidden rounded-lg border bg-surface',
              day.isToday ? 'border-spring' : 'border-line'
            )}
          >
            <DayCap
              label={day.label}
              dayNumber={day.dayNumber}
              isToday={day.isToday}
              isPast={day.isPast}
            />
            <div className="flex flex-1 flex-col p-1.5">
              {day.post ? (
                <Link
                  href={`/calendar?editPost=${day.post.id}`}
                  aria-label={`${day.label} ${day.dayNumber}, ${day.state} ${day.post.time}: ${day.post.title}`}
                  className={cn(
                    'flex flex-1 flex-col gap-1.5 rounded-md p-1.5 no-underline',
                    DAY_STATE_CLASSES[day.state],
                    day.state === 'published' ? 'text-white' : 'text-ink'
                  )}
                >
                  <PostThumbnail
                    src={day.post.imageUrl}
                    name={clientName}
                    className="h-20 w-full rounded-sm"
                  />
                  <span className="line-clamp-2 text-caption">{day.post.title}</span>
                  <span className="text-label tabular-nums tracking-normal opacity-70">
                    {day.post.time}
                  </span>
                  {day.count > 1 && (
                    <span className="text-micro opacity-70">+{day.count - 1} more</span>
                  )}
                </Link>
              ) : (
                <div
                  className={cn(
                    'grid flex-1 place-items-center rounded-md',
                    DAY_STATE_CLASSES.open
                  )}
                >
                  <Link
                    href="/calendar"
                    aria-label={`${day.label} ${day.dayNumber} is open — plan a post`}
                    className="rounded-sm bg-surface px-2.5 py-1 text-caption font-medium text-forest no-underline hover:bg-wash"
                  >
                    Plan
                  </Link>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between text-caption text-text3">
        <span>{open === 1 ? '1 day open' : `${open} days open`}</span>
        <Link href="/calendar" className="text-forest underline-offset-2 hover:underline">
          Open calendar <span aria-hidden="true">→</span>
        </Link>
      </div>
    </Card>
  )
}

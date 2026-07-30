import { cn } from '@/utils/cn'

/** Monday first, matching the coverage grid and the calendar. */
const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Bar geometry in px, so an empty day can never out-measure an occupied one. */
const BAR_AREA = 31
const EMPTY_BAR = 5
const MIN_FILLED_BAR = 12

interface MiniWeekProps {
  /** Filled slots per day, Monday first. */
  counts: number[]
  todayIndex: number
}

/**
 * Seven bars sized by how many posts each day of the week carries.
 *
 * Two facts live here — how full a day is, and whether it is today — and
 * neither may consume the other. Height carries the count; today is a lime rule
 * *beneath* the bar, so the day marked "now" still reports its own coverage.
 */
export function MiniWeek({ counts, todayIndex }: MiniWeekProps) {
  const busiest = Math.max(...counts, 1)

  // The chart is a graphic with no text, and the card's "3 of 7 days covered"
  // pill never says which three. This is that week, stated once, in words.
  const summary = counts
    .map((count, index) => {
      const today = index === todayIndex ? ' (today)' : ''
      const load = count === 0 ? 'nothing scheduled' : `${count} ${count === 1 ? 'post' : 'posts'}`
      return `${DAY_LABELS[index] ?? ''}${today}: ${load}`
    })
    .join(', ')

  return (
    <div className="mt-3.5">
      <span className="sr-only">{summary}</span>

      <div className="flex h-9 gap-1.5" aria-hidden="true">
        {counts.map((count, index) => {
          const isFilled = count > 0
          const height = isFilled
            ? MIN_FILLED_BAR + (count / busiest) * (BAR_AREA - MIN_FILLED_BAR)
            : EMPTY_BAR

          return (
            <div key={index} className="flex flex-1 flex-col gap-[3px]">
              <div className="flex items-end" style={{ height: BAR_AREA }}>
                <span
                  className={cn(
                    'w-full rounded-full',
                    // Hatching marks an open slot — nothing scheduled that day
                    // yet. Same texture token the coverage chips use on dark.
                    isFilled ? 'bg-white/85' : 'slot-open-inv'
                  )}
                  // Bar height is the datum, so it is the one thing inline.
                  style={{ height }}
                />
              </div>
              {/* Today is a rule under the bar, never the bar's own fill. */}
              <span
                className={cn(
                  'h-[2px] rounded-full',
                  index === todayIndex ? 'bg-accent' : 'bg-transparent'
                )}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

import { cn } from '@/utils/cn'
import { WEEKDAY_OPTIONS } from '@/utils/constants'

interface WeekPreviewProps {
  /** A `WEEKDAY_OPTIONS` value — the day the run lands on. */
  day: string
  /** Posts generated on that day. Zero renders every cell empty. */
  count: number
  /** Layout for the wrapper. The settings form needs `col-span-12`; the draft sheet does not. */
  className?: string
}

/**
 * Seven day cells showing which one the run lands on.
 *
 * Purely visual, so it is `aria-hidden` with the same fact spelled out in a sentence beside it —
 * the rule DESIGN.md sets for the coverage strip.
 *
 * Promoted out of `settings/schedule-tab.tsx` on its second consumer, per docs/CLAUDE.md. The
 * `col-span-12` it used to hard-code moved to `className`: that value belongs to the settings
 * form's twelve-column grid, and the onboarding draft sheet is not on that grid.
 */
export function WeekPreview({ day, count, className }: WeekPreviewProps) {
  const dayLabel = WEEKDAY_OPTIONS.find((w) => w.value === day)?.label ?? day

  return (
    <div className={className}>
      <div aria-hidden className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_OPTIONS.map((weekday) => {
          const isRunDay = weekday.value === day
          return (
            <div
              key={weekday.value}
              className={cn(
                'rounded-md border py-2 text-center text-micro',
                isRunDay
                  ? 'border-forest bg-forest text-surface/65'
                  : 'border-line bg-surface text-text3'
              )}
            >
              {weekday.label.slice(0, 3)}
              <b
                className={cn(
                  'mt-0.5 block text-caption font-semibold',
                  isRunDay ? 'text-surface' : 'text-ink'
                )}
              >
                {isRunDay && count > 0 ? count : '—'}
              </b>
            </div>
          )
        })}
      </div>
      <p className="sr-only">
        {count > 0
          ? `${count} post${count === 1 ? '' : 's'} generated every ${dayLabel}.`
          : 'Autonomous generation is off.'}
      </p>
    </div>
  )
}

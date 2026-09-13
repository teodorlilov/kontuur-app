import { cn } from '@/utils/cn'

interface DayCapProps {
  /** The weekday as a short label — "Mon". */
  label: string
  dayNumber: number
  isToday: boolean
  isPast: boolean
}

/**
 * A day's dateline: the weekday as the small label, the date as the thing said.
 *
 * The cap is tinted so seven columns read as seven columns — a white column on near-white paper
 * separates by 1.05:1 and its hairline edge by 1.13:1, together not enough to draw a grid, so the
 * header carries it alone. The number row has a fixed height on both variants: the lime plate is
 * taller than a bare numeral, and without it today's lane would start three pixels below its
 * neighbours', so seven columns' cards no longer line up. Today obeys DESIGN.md's Two Facts Rule —
 * a New Growth plate BEHIND the number, so the lane below stays free to say whether today is
 * covered — and it is a pill rather than a fixed circle so today's date keeps the size the other
 * six have; the plate is a control-shaped lime area and takes the Pine Deep edge at 45%. A past
 * day is quiet ink rather than a grey ground: it recedes without claiming the column is a
 * different kind of thing.
 *
 * Promoted out of the calendar's `DayColumn` when the dashboard's My week became its second
 * consumer. Primitives only, so nothing here knows what a lane holds.
 */
export function DayCap({ label, dayNumber, isToday, isPast }: DayCapProps) {
  return (
    <div
      className={cn(
        'flex flex-none flex-col gap-0.5 border-b px-3 py-2',
        isToday ? 'border-spring/40 bg-wash' : 'border-line bg-sunken'
      )}
    >
      <span
        className={cn('text-label font-semibold uppercase', isToday ? 'text-forest' : 'text-text3')}
      >
        {label}
      </span>
      <span className="flex h-6 items-center">
        {isToday ? (
          <span className="flex h-6 items-center rounded-full bg-accent px-2 text-title font-semibold tabular-nums text-forest-deep shadow-[inset_0_0_0_1px_rgba(12,46,32,0.45)]">
            {dayNumber}
          </span>
        ) : (
          <span
            className={cn(
              'text-title tabular-nums',
              isPast ? 'font-medium text-text3' : 'font-semibold text-ink'
            )}
          >
            {dayNumber}
          </span>
        )}
      </span>
    </div>
  )
}

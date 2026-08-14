'use client'

import { cn } from '@/utils/cn'
import { COVERAGE_INK, COVERAGE_TONE } from '@/features/calendar/lib/coverage-tone'
import { describeCoverage, type ClientDay } from '@/features/calendar/lib/week-model'
import { isoToDateTimeFields } from '@/utils/date-helpers'

/**
 * DESIGN.md's Signature Component: seven chips, one per day, encoding a client's week.
 *
 * **Each chip carries its hour.** The mock specified it verbatim — the cell's text
 * content is the time — and shipping it empty left the strip answering only "is this day
 * covered", when the hour is the thing an agency is actually scheduling. An occupied cell
 * shows when the post goes out; a hatched one shows the suggested time nothing filled,
 * which the hatch already marks as a suggestion rather than a commitment.
 *
 * Cells encode **state only, never client identity**. Casa Ceramics' identity hue is
 * Clay (`#A2603F`) and the failure colour is `--danger` (`#b04a38`) — a hue-coded cell
 * for that client would be indistinguishable from a failed one sitting beside it. The
 * row's monogram carries identity; the chips carry state.
 *
 * The spoken equivalent is built in rather than left to the caller: a strip without one
 * is "incomplete, not merely imperfect".
 *
 * Lives in the calendar for now. It moves to `components/ui/` when the dashboard's
 * `CoverageRow` adopts it — converting that second consumer is what earns the promotion.
 */
export function CoverageStrip({
  week,
  timeZone,
  className,
}: {
  week: ClientDay[]
  /** The agency zone. The hour printed here must match the one the week grid shows. */
  timeZone: string
  className?: string
}) {
  return (
    <>
      {/* A sunken bed under the seven cells. Without it the strip is a scatter of marks
          in open space, and a week holding one post reads as a week holding nothing —
          the shape of the week has to be legible before its contents are. */}
      <div
        aria-hidden="true"
        className={cn(
          'grid grid-cols-7 gap-1 rounded-md bg-sunken p-1 ring-1 ring-inset ring-line2',
          className
        )}
      >
        {week.map((day, index) => (
          <span
            key={index}
            className={cn(
              // tracking-normal cancels the Label role's +0.16em, which on a five-glyph
              // numeral pushes "09:00" past the width of a seventh of the strip.
              'grid h-7 place-items-center rounded-xs text-label font-semibold tracking-normal tabular-nums',
              COVERAGE_TONE[day.state],
              COVERAGE_INK[day.state]
            )}
          >
            {day.at ? isoToDateTimeFields(day.at, timeZone).time : ''}
          </span>
        ))}
      </div>
      <span className="sr-only">{describeCoverage(week, timeZone)}</span>
    </>
  )
}

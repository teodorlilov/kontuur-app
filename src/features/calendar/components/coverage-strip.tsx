'use client'

import { cn } from '@/utils/cn'
import { COVERAGE_TONE } from '@/features/calendar/lib/coverage-tone'
import { describeCoverage, type CoverageState } from '@/features/calendar/lib/week-model'

/**
 * DESIGN.md's Signature Component: seven chips, one per day, encoding a client's week.
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
 * The month's day cells share this component's *tones* (`lib/coverage-tone.ts`) but not
 * its geometry, which is why that map is a separate module and this is not yet shared.
 */
export function CoverageStrip({ week, className }: { week: CoverageState[]; className?: string }) {
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
        {week.map((state, index) => (
          <span key={index} className={cn('h-6 rounded-xs', COVERAGE_TONE[state])} />
        ))}
      </div>
      <span className="sr-only">{describeCoverage(week)}</span>
    </>
  )
}

'use client'

import { cn } from '@/utils/cn'
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
 */

/**
 * The states in ascending order of how much they have to say, so the strip reads as one
 * ladder rather than six unrelated fills: a recess, a hatched outline, amber, a green
 * tint, solid green — and clay when something broke.
 *
 * Every occupied state carries an **inset ring** as well as a fill. The neutrals in this
 * system sit within 1.05:1 of each other by design (DESIGN.md leans on the contour field
 * for page-level depth, not on tone), so a fill alone is not a boundary at 24px. The
 * first version of this file used Sunken for `none` and Surface for `scheduled`; on the
 * Amber row ground those measured 1.02:1 and 1.06:1 against what sat behind them, which
 * is a signature component rendering its data invisibly.
 */
const STATE_CLASS: Record<CoverageState, string> = {
  // Nothing here, and nothing was expected. A recess in the bed, not a chip.
  none: 'bg-ink/[0.05]',
  // --hatch, the token reserved for absence, on Surface so the cell reads as a place
  // something could still go.
  open: 'slot-open bg-surface ring-1 ring-inset ring-line2',
  missed: 'bg-pending/[0.22] ring-1 ring-inset ring-pending/[0.55]',
  // Marker on a Deep Pine edge — DESIGN.md § Chips pairs Marker with "scheduled", and
  // the edge is what separates a tint this light from the bed under it.
  scheduled: 'bg-marker ring-1 ring-inset ring-forest/[0.38]',
  // Solid: it happened, and it is the strongest thing the strip can say.
  published: 'bg-forest',
  failed: 'bg-danger/[0.18] ring-1 ring-inset ring-danger/[0.55]',
}

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
          <span key={index} className={cn('h-6 rounded-xs', STATE_CLASS[state])} />
        ))}
      </div>
      <span className="sr-only">{describeCoverage(week)}</span>
    </>
  )
}

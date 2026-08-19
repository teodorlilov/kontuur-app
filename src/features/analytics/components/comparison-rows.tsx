import type { ComparisonRow } from '../lib/build-report'
import { formatCount } from '../lib/format'

interface ComparisonRowsProps {
  rows: ComparisonRow[]
  /** The chart restated in words — this element is one image to a reader. */
  ariaLabel: string
}

/** Bars stop at 82% so the printed value always has room at the row's end. */
const BAR_SPAN_PCT = 82

/**
 * The one paired-bar chart: a labeled row, this period's bar over last
 * period's thinner sage bar, both value-labeled. Formats, the taps funnel and
 * the follower flow all render through here — identity lives in the row label,
 * so every bar keeps one hue.
 */
export function ComparisonRows({ rows, ariaLabel }: ComparisonRowsProps) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.now ?? 0, row.then ?? 0]))
  return (
    <div role="img" aria-label={ariaLabel} className="mt-3 grid gap-3.5">
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[7.5rem_1fr] items-center gap-3.5">
          <div className="text-caption font-medium text-ink">
            {row.label}
            {row.meta && (
              <span className="block text-micro font-normal text-text3">{row.meta}</span>
            )}
          </div>
          <div className="grid gap-[3px]">
            <div className="flex h-4 items-center">
              {row.now !== null && row.now > 0 && (
                <i
                  className="block h-full rounded-r bg-forest"
                  // Computed width — the one truly dynamic style.
                  style={{ width: `${((row.now / max) * BAR_SPAN_PCT).toFixed(1)}%` }}
                />
              )}
              <span className="ml-2 whitespace-nowrap text-micro font-medium tabular-nums text-ink">
                {row.now === null ? '—' : formatCount(row.now)}
              </span>
            </div>
            <div className="flex h-2 items-center">
              {row.then !== null && row.then > 0 && (
                <i
                  className="block h-full rounded-r bg-metric-3"
                  style={{ width: `${((row.then / max) * BAR_SPAN_PCT).toFixed(1)}%` }}
                />
              )}
              <span className="ml-2 whitespace-nowrap text-micro tabular-nums text-text3">
                {row.then === null ? '—' : formatCount(row.then)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

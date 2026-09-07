import { CHART_COLORS } from '../../lib/compute/chart-config'
import { lastPoint, lineSegments, segmentsToPath } from '../../lib/compute/svg-path'

const WIDTH = 220
const HEIGHT = 28

/**
 * The strip cell's day-by-day trace, ending on the Living Green now-mark.
 * Decorative reinforcement only: the cell prints its value, delta and
 * last-period line, and carries an sr-only sentence, so this stays aria-hidden
 * rather than being read a second time.
 */
export function Sparkline({ values }: { values: Array<number | null> }) {
  const real = values.filter((value): value is number => value !== null)
  if (real.length === 0) return null
  const min = Math.min(...real)
  const max = Math.max(...real)
  const x = (index: number): number => 2 + (index * (WIDTH - 10)) / Math.max(values.length - 1, 1)
  const y = (value: number): number => 3 + (1 - (value - min) / (max - min || 1)) * (HEIGHT - 8)
  const segments = lineSegments(values, x, y)
  const end = lastPoint(segments)

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="mt-2.5 block h-7 w-full"
      aria-hidden="true"
    >
      <path
        d={segmentsToPath(segments)}
        fill="none"
        stroke={CHART_COLORS.then}
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {end && (
        <>
          <circle cx={end.x} cy={end.y} r={4} fill="#fff" />
          <circle cx={end.x} cy={end.y} r={2.8} fill={CHART_COLORS.instant} />
        </>
      )}
    </svg>
  )
}

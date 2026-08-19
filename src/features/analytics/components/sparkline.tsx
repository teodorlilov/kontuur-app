import { CHART_COLORS } from '../lib/chart-config'
import { lastPoint, lineSegments, segmentsToPath } from '../lib/svg-path'

const WIDTH = 220
const HEIGHT = 28

/**
 * The strip cell's thirty-day trace: a sage line with a Living Green end-dot
 * (the now-mark). Purely decorative reinforcement — the cell's printed value,
 * delta and then-line carry the information, so this stays aria-hidden.
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

/**
 * Line-path building shared by the sparkline and the reach trend. A null day
 * is the API's silence, so paths BREAK at nulls instead of lying across them —
 * each contiguous run of real values becomes its own segment.
 */

export interface LinePoint {
  x: number
  y: number
}

/** Contiguous non-null runs as point lists, using the given scales. */
export function lineSegments(
  values: Array<number | null>,
  x: (index: number) => number,
  y: (value: number) => number
): LinePoint[][] {
  const segments: LinePoint[][] = []
  let run: LinePoint[] = []
  values.forEach((value, index) => {
    if (value === null) {
      if (run.length > 0) segments.push(run)
      run = []
      return
    }
    run.push({ x: x(index), y: y(value) })
  })
  if (run.length > 0) segments.push(run)
  return segments
}

/** One SVG path `d` covering every segment (gaps become pen lifts). */
export function segmentsToPath(segments: LinePoint[][]): string {
  return segments
    .filter((segment) => segment.length > 1)
    .map((segment) =>
      segment
        .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
        .join(' ')
    )
    .join(' ')
}

/** The last real point — where the "now" dot sits. */
export function lastPoint(segments: LinePoint[][]): LinePoint | null {
  const tail = segments[segments.length - 1]
  return tail ? (tail[tail.length - 1] ?? null) : null
}

/** Rounds a chart ceiling up to a clean step of its own magnitude. */
export function niceCeil(value: number): number {
  if (value <= 0) return 1
  const unit = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / unit) * unit
}

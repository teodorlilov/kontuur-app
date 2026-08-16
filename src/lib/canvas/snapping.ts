/** Alignment snapping: where a dragged node's edges and centre want to land. */

/** How close (in canvas px) an edge must come before it snaps. Callers divide by the view scale. */
export const SNAP_TOLERANCE = 5

/** Ties this close to the winning stop are drawn too, so every satisfied alignment shows a guide. */
const TIE_EPSILON = 0.1

export interface SnapRect {
  x: number
  y: number
  width: number
  height: number
}

export interface SnapStops {
  /** Vertical guide positions (x coordinates). */
  vertical: number[]
  /** Horizontal guide positions (y coordinates). */
  horizontal: number[]
}

export interface SnapGuide {
  axis: 'vertical' | 'horizontal'
  /** Where the guide line sits, in canvas space. */
  position: number
}

interface SnapResult {
  dx: number
  dy: number
  guides: SnapGuide[]
}

/**
 * Every position a dragged node can align to: the start, centre and end of each sibling, plus the
 * canvas bounds and its centre lines.
 */
export function collectSnapStops(siblings: SnapRect[], canvas: { w: number; h: number }): SnapStops {
  const vertical = [0, canvas.w / 2, canvas.w]
  const horizontal = [0, canvas.h / 2, canvas.h]
  for (const rect of siblings) {
    vertical.push(rect.x, rect.x + rect.width / 2, rect.x + rect.width)
    horizontal.push(rect.y, rect.y + rect.height / 2, rect.y + rect.height)
  }
  return { vertical, horizontal }
}

/**
 * The nudge that pulls a moving rect onto the nearest stop on each axis, plus the guides to draw.
 * Its own three anchors (start, centre, end) all compete; the closest within tolerance wins.
 */
export function snapRect(
  moving: SnapRect,
  stops: SnapStops,
  tolerance: number = SNAP_TOLERANCE
): SnapResult {
  const horizontalPull = nearestStop(
    [moving.x, moving.x + moving.width / 2, moving.x + moving.width],
    stops.vertical,
    tolerance
  )
  const verticalPull = nearestStop(
    [moving.y, moving.y + moving.height / 2, moving.y + moving.height],
    stops.horizontal,
    tolerance
  )
  return {
    dx: horizontalPull?.delta ?? 0,
    dy: verticalPull?.delta ?? 0,
    guides: [
      ...(horizontalPull?.positions ?? []).map(
        (position): SnapGuide => ({ axis: 'vertical', position })
      ),
      ...(verticalPull?.positions ?? []).map(
        (position): SnapGuide => ({ axis: 'horizontal', position })
      ),
    ],
  }
}

// The smallest move that lands any anchor on any stop, and every stop that move also satisfies.
function nearestStop(
  anchors: number[],
  stops: number[],
  tolerance: number
): { delta: number; positions: number[] } | null {
  let best: { delta: number; distance: number } | null = null
  for (const anchor of anchors) {
    for (const stop of stops) {
      const distance = Math.abs(stop - anchor)
      if (distance > tolerance) continue
      if (!best || distance < best.distance) best = { delta: stop - anchor, distance }
    }
  }
  if (!best) return null

  const positions = new Set<number>()
  for (const anchor of anchors) {
    for (const stop of stops) {
      if (Math.abs(stop - (anchor + best.delta)) <= TIE_EPSILON) positions.add(stop)
    }
  }
  return { delta: best.delta, positions: [...positions] }
}

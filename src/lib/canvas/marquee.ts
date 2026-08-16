/** Rubber-band selection: which nodes a dragged rectangle has caught. */

export interface MarqueeRect {
  x: number
  y: number
  width: number
  height: number
}

/** A rect from two corner points, in any drag direction. */
export function rectFromPoints(
  start: { x: number; y: number },
  end: { x: number; y: number }
): MarqueeRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

/**
 * The ids whose bounds the marquee touches. Touching is enough — requiring full containment makes
 * a band-select feel broken when one node hangs slightly outside the sweep.
 */
export function idsIntersectingRect(
  candidates: Array<{ id: string; rect: MarqueeRect }>,
  marquee: MarqueeRect
): string[] {
  return candidates.filter(({ rect }) => intersects(rect, marquee)).map(({ id }) => id)
}

function intersects(a: MarqueeRect, b: MarqueeRect): boolean {
  return (
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  )
}

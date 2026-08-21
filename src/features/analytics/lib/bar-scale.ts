/**
 * The one implementation of DESIGN.md's volume-bar rule:
 *
 * > an empty state must never render larger than an occupied one. Height maps
 * > to count, with a small fixed floor for zero.
 *
 * The rule was written down once and implemented three times, in two different
 * units — `min-w-[3px]` on the comparison rows, `Math.max(w, 1.2)` on the
 * funnel, and nothing at all on the audience place lists, where a third-place
 * country at 0.4% of a 62% leader drew 0.57% of its track: about one pixel on a
 * 1.5px bar, beside a label that rounded to "0%". A real value rendering as an
 * empty row is the same defect the format rows were fixed for.
 *
 * What is NOT shared is the span each bar stops at. Those differ because each
 * reserves room for a different neighbour — an inline value, an inline caption,
 * or nothing at all — so each call site names its own and says what it is
 * clearing.
 */

/**
 * The smallest bar a nonzero value may draw, as a percentage of its track.
 *
 * A percentage rather than a pixel count so the floor means the same thing on
 * every track in the document: `min-w-[3px]` was a quarter of the funnel's
 * floor on a wide comparison row and twice it on a narrow place list. 1.2%
 * survives the thinnest track here (the 1.5px place-list pill) as a visible
 * mark rather than a hairline.
 */
export const MIN_VISIBLE_PCT = 1.2

/**
 * A value's bar width as a percentage of its track, floored so a measured
 * value never renders as nothing.
 *
 * Returns 0 for zero and for an unusable maximum — a measured zero is an
 * absence of length, and each surface draws it in its own vocabulary (an
 * anchor tick, an empty well). This only governs values that DO have length.
 */
export function barWidthPct(value: number, max: number, span: number): number {
  if (value <= 0 || max <= 0) return 0
  return Math.max((value / max) * span, MIN_VISIBLE_PCT)
}

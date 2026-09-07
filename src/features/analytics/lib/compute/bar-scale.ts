/**
 * DESIGN.md:438 — "an empty state must never render larger than an occupied one. Height maps to
 * count, with a small fixed floor for zero." This is where that floor lives.
 */

/**
 * The smallest bar a nonzero value may draw, as a percentage of its track.
 *
 * A percentage, not a pixel count, because the three callers give their bars different spans —
 * 78 in funnel-section, 82 in comparison-rows, 88 in audience-section — so a fixed pixel floor
 * would mean a different fraction of each. `bar-scale.test.ts` pins it below the smallest of
 * the three.
 */
export const MIN_VISIBLE_PCT = 1.2

/**
 * A value's bar width as a percentage of its track, floored so a measured value never renders
 * as nothing. `span` is how far the caller lets a full-width bar run: each reserves room for a
 * different neighbour, so each names its own.
 *
 * Zero and an unusable maximum both return 0, not the floor — a measured zero has no length to
 * draw, and each surface renders that in its own vocabulary.
 */
export function barWidthPct(value: number, max: number, span: number): number {
  if (value <= 0 || max <= 0) return 0
  return Math.max((value / max) * span, MIN_VISIBLE_PCT)
}

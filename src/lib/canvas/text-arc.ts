/**
 * Where a point on a straight baseline lands once the line is bent into an arc.
 *
 * Pure and Konva-free, like every module in this directory — the renderer that drives Konva's
 * per-character hook lives one directory over, the same split `markerBands`/`highlightBands` uses.
 */

/** `sin t / t`, defined at 0. The removable singularity is what makes bend 0 exact. */
function sinc(t: number): number {
  return t === 0 ? 1 : Math.sin(t) / t
}

/**
 * `(1 − cos t) / t`, defined at 0 — NOT the classical versine.
 *
 * Dividing by `t` is what makes the vertical rise scale with the arc's curvature rather than with
 * the square of the line's length; `1 − cos t` would give a sagitta that grows with the string.
 */
function vers(t: number): number {
  return t === 0 ? 0 : (1 - Math.cos(t)) / t
}

/** A glyph's baseline centre after bending, and the angle it stands at (RADIANS). */
export interface ArcPoint {
  x: number
  y: number
  /** Tangent angle in radians — the raw canvas `rotate` unit, not Konva's node degrees. */
  angle: number
}

/**
 * Bend expressed as the fraction of a half-turn the whole line subtends: `angle = bend · π`.
 *
 * A radius would be the obvious parameter and is unusable as a drag: straight is R = ∞, so the
 * useful range is a hyperbola and the first pixel of movement jumps from flat to a tight circle.
 * A sweep angle is linear under the hand, and it degrades correctly with length — at a fixed angle
 * a longer line keeps the same visual curvature and simply gets a bigger radius, where a fixed
 * radius would let a long line wrap past a full turn and eat itself.
 */
const MAX_SWEEP = Math.PI

/**
 * Map a point on a straight line to its place on the arc.
 *
 * `centre` is the glyph's baseline centre measured from the line's left edge, `lineWidth` the
 * line's whole advance. Both come from the caller's own text walk, so this never measures anything.
 *
 * At `bend === 0` this returns the input unchanged — exactly, not nearly. That matters because the
 * control passes through zero on the way to everywhere else.
 */
export function arcPointAt(centre: number, lineWidth: number, bend: number): ArcPoint {
  const sweep = bend * MAX_SWEEP
  // A zero-width line has no curvature to distribute; guarding here keeps the caller from having
  // to care about an empty or single-space string.
  const curvature = lineWidth > 0 ? sweep / lineWidth : 0
  // Signed distance from the middle of the line — the arc is symmetric about it, so a glyph's
  // place depends only on how far from centre it is.
  const offset = centre - lineWidth / 2
  const angle = curvature * offset
  // +y is down, so a positive bend lifts the middle and drops the ends: an arch.
  const rise = offset * vers(angle)
  return {
    x: lineWidth / 2 + offset * sinc(angle),
    // Normalised away from -0, which `offset * 0` produces for every glyph left of centre. It
    // draws identically, but it is not `Object.is`-equal to 0 and would make the identity test
    // — the one thing guaranteeing a bend of zero does not nudge the text — quietly untestable.
    y: rise === 0 ? 0 : rise,
    angle: angle === 0 ? 0 : angle,
  }
}

/**
 * The steepest bend this line can take before its glyphs collide on the inner radius.
 *
 * Short strings are the constraint: three characters bent through a half-turn would stack on top of
 * each other. The bound is deliberately loose rather than the geometrically clean "glyphs never
 * touch" one — that would cap a ten-character headline at about a third of the control's range and
 * leave most of the slider dead for ordinary text.
 */
export function maxBend(lineWidth: number, fontSize: number): number {
  if (lineWidth <= 0 || fontSize <= 0) return 0
  // Keep the tightest radius at or above 1.5 line-heights: below that the inner edges of the
  // letterforms begin to overlap on any face in the library.
  const limit = lineWidth / (MAX_SWEEP * 1.5 * fontSize)
  return Math.min(1, limit)
}

/** `bend` clamped to what this line can actually carry, keeping its direction. */
export function clampBend(bend: number, lineWidth: number, fontSize: number): number {
  const limit = maxBend(lineWidth, fontSize)
  return Math.max(-limit, Math.min(limit, bend))
}

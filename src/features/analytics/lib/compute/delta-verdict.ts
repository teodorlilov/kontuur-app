/**
 * When is a change worth announcing? Counting noise is absolute (~√N), so the
 * rule scales with the number itself, never with the account: a 1→3 swing is
 * noise on a 100-follower account AND on a five-million one. A change inside
 * the noise band renders quiet and gray; a percentage prints only when the
 * base is solid enough that one person's action barely moves it. Nothing is
 * hidden — the absolute change always shows; this only governs the shouting.
 */

/** ±2√N — roughly two standard deviations of independent-event noise. */
const NOISE_K = 2
/** Below this base one event moves the percentage ≥10 points — too grainy to print. */
const PCT_BASE_FLOOR = 10
/**
 * A rate colors (or prints at all, for per-format ER) only when its
 * denominator measured at least this much — rates off tiny reach are
 * arithmetic, not evidence.
 */
export const RATE_BASE_FLOOR = 1000

export type DeltaVerdict =
  /** No comparison exists — one side was never captured. */
  | { kind: 'none' }
  /** Within normal variation — stated in gray, never colored. */
  | { kind: 'quiet'; diff: number }
  /** A real move; pct is null when the base is too grainy to print honestly. */
  | { kind: 'move'; diff: number; pct: number | null }

export function countDeltaVerdict(now: number | null, then: number | null): DeltaVerdict {
  if (now === null || then === null) return { kind: 'none' }
  const diff = now - then
  const band = NOISE_K * Math.sqrt(Math.max(Math.abs(then), 1))
  if (Math.abs(diff) <= band) return { kind: 'quiet', diff }
  return { kind: 'move', diff, pct: then >= PCT_BASE_FLOOR ? (diff / then) * 100 : null }
}

/**
 * Percentage-point rates (engagement) floor on their DENOMINATOR instead: a
 * rate computed off 644 reached accounts is arithmetic, not evidence — the
 * points may only color when both windows measured real reach.
 */
export function rateDeltaVerdict(
  deltaPt: number | null,
  baseNow: number | null,
  baseThen: number | null
): DeltaVerdict {
  if (deltaPt === null) return { kind: 'none' }
  const solid = (baseNow ?? 0) >= RATE_BASE_FLOOR && (baseThen ?? 0) >= RATE_BASE_FLOOR
  if (!solid || Math.abs(deltaPt) < 0.05) return { kind: 'quiet', diff: deltaPt }
  return { kind: 'move', diff: deltaPt, pct: null }
}

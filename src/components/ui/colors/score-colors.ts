/**
 * Polymorphic score-to-color mappings used by quality, slop, and language UI.
 * Centralises the thresholds so every component stays consistent.
 *
 * Status colour here is earthen, per DESIGN.md § The Muted Status Rule: a pass
 * is Deep Pine on Wash, a warning is Amber, a failure is Clay. The stock
 * `green-500` / `amber-400` / `red-500` this used to return are the saturated
 * defaults that rule rejects on sight, and they were the loudest colours in the
 * app — louder than New Growth, on a surface that is meant to recede.
 */

/** Progress-bar fill color for 1-10 scores. */
export function scoreBarColor(score: number): string {
  if (score >= 8) return 'bg-spring'
  if (score >= 6) return 'bg-pending'
  return 'bg-danger'
}

/** Text color for 1-10 scores. */
export function scoreTextColor(score: number): string {
  // Living Green Text, not --spring: green as a word on light needs 4.53:1.
  if (score >= 8) return 'text-spring-text'
  if (score >= 6) return 'text-pending'
  return 'text-danger'
}

/** Carousel slide status → dot color. */
const STATUS_DOT_COLORS: Record<string, string> = {
  pass: 'bg-spring',
  warn: 'bg-pending',
  fail: 'bg-danger',
}

export function statusDotColor(status?: string): string {
  return (status && STATUS_DOT_COLORS[status]) ?? 'bg-line2'
}


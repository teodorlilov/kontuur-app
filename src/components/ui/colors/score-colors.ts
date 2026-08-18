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

/**
 * The one banding for a 1–10 score.
 *
 * Every score colour in the app derives from this. There used to be four thresholds:
 * this file's 8/6, and three more inside the calendar — two copies of a `>= 7` split and
 * a `>= 9` one on the quality pill. The last two sat in the same modal, so a post scoring
 * 8 rendered amber in the header and green in the sidebar forty pixels away.
 */
type ScoreBand = 'strong' | 'fair' | 'weak'

export function scoreBand(score: number): ScoreBand {
  if (score >= 8) return 'strong'
  if (score >= 6) return 'fair'
  return 'weak'
}

/**
 * The same three bands as the CSS pair a tinted chip needs.
 *
 * CSS values rather than Tailwind classes because the consumer is `TagPill`, which takes
 * `background`/`color` — and keeping it value-only is what lets that component stay a
 * single code path (its class-or-value branch was dead and has been removed).
 */
export const SCORE_BAND_VARS: Record<ScoreBand, { bg: string; color: string }> = {
  strong: { bg: 'var(--wash)', color: 'var(--forest)' },
  fair: { bg: 'var(--pending-bg)', color: 'var(--pending)' },
  weak: { bg: 'var(--danger-bg)', color: 'var(--danger)' },
}

const BAR_CLASS: Record<ScoreBand, string> = {
  strong: 'bg-spring',
  fair: 'bg-pending',
  weak: 'bg-danger',
}

const TEXT_CLASS: Record<ScoreBand, string> = {
  // Living Green Text, not --spring: green as a word on light needs 4.53:1.
  strong: 'text-spring-text',
  fair: 'text-pending',
  weak: 'text-danger',
}

/** Progress-bar fill color for 1-10 scores. */
export function scoreBarColor(score: number): string {
  return BAR_CLASS[scoreBand(score)]
}

/** Text color for 1-10 scores. */
export function scoreTextColor(score: number): string {
  return TEXT_CLASS[scoreBand(score)]
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

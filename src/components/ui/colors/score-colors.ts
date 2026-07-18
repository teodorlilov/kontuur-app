/**
 * Polymorphic score-to-color mappings used by quality, slop, and language UI.
 * Centralises the thresholds so every component stays consistent.
 */

/** Score badge colors (bg + text) for 1-10 scores. */
export function scoreBadgeClass(score: number): string {
  if (score >= 8) return 'bg-green-100 text-green-700'
  if (score >= 6) return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-700'
}

/** Progress-bar fill color for 1-10 scores. */
export function scoreBarColor(score: number): string {
  if (score >= 8) return 'bg-green-500'
  if (score >= 6) return 'bg-amber-400'
  return 'bg-red-500'
}

/** Text color for 1-10 scores. */
export function scoreTextColor(score: number): string {
  if (score >= 8) return 'text-green-700'
  if (score >= 6) return 'text-amber-700'
  return 'text-red-600'
}


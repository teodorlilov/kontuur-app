import type { StepperPhase } from '@/features/sources/types'

/**
 * Build the ordered step sequence.
 * Scan and pages cover the website; the summary persists it and finishes.
 */
export function buildStepSequence(): StepperPhase[] {
  return [
    { type: 'scan' },
    { type: 'website-pages' },
    { type: 'rss' },
    { type: 'extras' },
    { type: 'summary' },
  ]
}

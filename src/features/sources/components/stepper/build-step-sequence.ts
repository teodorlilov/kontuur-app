import type { StepperPhase } from '@/features/sources/types'

/**
 * Build the ordered step sequence.
 * Always includes all source type steps, then the final review.
 */
export function buildStepSequence(): StepperPhase[] {
  return [
    { type: 'website-url' },
    { type: 'website-pages' },
    { type: 'website-confirm' },
    { type: 'rss' },
    { type: 'extras' },
    { type: 'review' },
  ]
}

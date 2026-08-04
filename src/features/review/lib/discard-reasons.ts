import { DISCARD_REASONS, type DiscardReason } from '@/lib/validation'

/** The discard toast's chips — reviewer-facing labels over the persisted values. */
export const DISCARD_REASON_LABELS: Record<DiscardReason, string> = {
  off_brand: 'Off-brand voice',
  repetitive: 'Repetitive topic',
  wrong_facts: 'Factually off',
  weak_source: 'Weak source',
  bad_timing: 'Bad timing',
}

export { DISCARD_REASONS, type DiscardReason }

import type { ValidationCriteria, ValidationScores, SlopDetection } from '@/types/api'
import { deriveSlopFromQuality } from '@/ai/validation/content-rules/compute-scores'

/** Extract criteria + scores from the validation JSON blob stored in DB. */
export function parseValidationJson(
  raw: unknown
): { criteria: ValidationCriteria; scores: ValidationScores } | null {
  if (!raw || typeof raw !== 'object') return null
  const q = raw as Record<string, unknown>
  if (!q.criteria || !q.scores) return null
  return { criteria: q.criteria as ValidationCriteria, scores: q.scores as ValidationScores }
}

/** Derive slop data from validation JSON if available (avoids a separate API call). */
export function deriveSlopFromValidation(validationJson: unknown): SlopDetection | null {
  const parsed = parseValidationJson(validationJson)
  if (!parsed?.scores.human_score) return null
  return deriveSlopFromQuality({
    human_score: parsed.scores.human_score,
    ai_tells: parsed.criteria.ai_tells ?? [],
    worst_offending_phrase: parsed.criteria.worst_offending_phrase ?? null,
  })
}

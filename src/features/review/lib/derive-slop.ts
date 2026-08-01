import { parseStoredValidation } from '@/lib/validation/stored-validation-schema'
import { deriveSlopFromQuality } from '@/ai/validation/content-rules/compute-scores'
import type { SlopDetection } from '@/types/api'

/** Derive slop data from validation JSON if available (avoids a separate API call). */
export function deriveSlopFromValidation(validationJson: unknown): SlopDetection | null {
  const parsed = parseStoredValidation(validationJson)
  if (!parsed?.scores.human_score) return null
  return deriveSlopFromQuality({
    human_score: parsed.scores.human_score,
    ai_tells: parsed.criteria.ai_tells,
    worst_offending_phrase: parsed.criteria.worst_offending_phrase,
  })
}

import { parseStoredValidation } from '@/lib/validation/stored-validation-schema'
import { deriveSlopFromValidation } from '@/features/review/lib/derive-slop'
import type { ValidationData } from '@/types/api'

/**
 * Projects stored `posts.validation_json` into the full ValidationData the
 * shared review leaves render. Rows written after 2026-08 carry everything;
 * older rows get slop reconstructed from their scores and an empty language
 * receipt (the fixes were applied at generation time but never persisted).
 */
export function toValidationData(validationJson: unknown): ValidationData | null {
  const stored = parseStoredValidation(validationJson)
  if (!stored) return null

  return {
    criteria: stored.criteria,
    scores: stored.scores,
    language: stored.language
      ? { ...stored.language, corrected_text: null }
      : {
          passes: true,
          language_score: stored.scores.language_score,
          issues: [],
          corrected_text: null,
        },
    slop: stored.slop ??
      deriveSlopFromValidation(validationJson) ?? {
        // Authenticity unknown (pre-scores row). null, not a verdict: this used to
        // claim `reads_as_human: true` and a measured 0 in the same breath, and the
        // 0 was an in-band sentinel triage had to special-case.
        reads_as_human: null,
        ai_tells_found: stored.criteria.ai_tells,
        worst_offending_phrase: stored.criteria.worst_offending_phrase,
        human_authenticity_score: null,
      },
    ...(stored.sourceGrounding ? { sourceGrounding: stored.sourceGrounding } : {}),
  }
}

/**
 * A post whose validation predates the current shapes entirely — render the
 * surface with neutral evidence instead of dropping the post from the queue.
 */
export function fallbackValidationData(qualityScoreAvg: number | null): ValidationData {
  const score = qualityScoreAvg
  return {
    criteria: {
      ai_tells: [],
      worst_offending_phrase: null,
      structure_followed: null,
      source_claims: null,
      health_compliant: null,
      issues: [],
    },
    // Nothing here was measured, so nothing here carries a number or a verdict.
    // The zeros this used to fabricate put every legacy post in needs_attention
    // wearing a "Sounds like AI" chip from a measurement nobody made.
    scores: { overall_score: score, human_score: null, language_score: null, source_score: null },
    language: { passes: true, language_score: null, issues: [], corrected_text: null },
    slop: {
      reads_as_human: null,
      ai_tells_found: [],
      worst_offending_phrase: null,
      human_authenticity_score: null,
    },
  }
}

/** True when neither stored slop nor stored scores can say how human the copy reads. */
export function needsSlopFallback(validationJson: unknown): boolean {
  const stored = parseStoredValidation(validationJson)
  if (!stored) return true
  // Explicit null check: a measured 0 is the strongest verdict there is, and a
  // falsy check would overwrite it with a fresh detect-slop call on every focus.
  return !stored.slop && stored.scores.human_score === null
}

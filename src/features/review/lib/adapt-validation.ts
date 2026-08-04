import { parseStoredValidation } from '@/lib/validation/stored-validation-schema'
import { deriveSlopFromValidation } from '@/features/review/lib/derive-slop'
import type { ValidationData } from '@/types/post'

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
    slop:
      stored.slop ??
      deriveSlopFromValidation(validationJson) ?? {
        // Authenticity unknown (pre-scores row) — 0 keeps the "sounds like AI"
        // flag honest until the shell's one-shot detect-slop call replaces it.
        reads_as_human: true,
        ai_tells_found: stored.criteria.ai_tells,
        worst_offending_phrase: stored.criteria.worst_offending_phrase,
        human_authenticity_score: 0,
      },
    ...(stored.sourceGrounding
      ? { sourceGrounding: { ...stored.sourceGrounding, corrected_text: null } }
      : {}),
  }
}

/**
 * A post whose validation predates the current shapes entirely — render the
 * surface with neutral evidence instead of dropping the post from the queue.
 */
export function fallbackValidationData(qualityScoreAvg: number | null): ValidationData {
  const score = qualityScoreAvg ?? 0
  return {
    criteria: {
      ai_tells: [],
      worst_offending_phrase: null,
      structure_followed: null,
      source_claims: null,
      health_compliant: null,
      issues: [],
    },
    scores: { overall_score: score, human_score: 0, language_score: score, source_score: null },
    language: { passes: true, language_score: score, issues: [], corrected_text: null },
    slop: {
      reads_as_human: true,
      ai_tells_found: [],
      worst_offending_phrase: null,
      human_authenticity_score: 0,
    },
  }
}

/** True when neither stored slop nor stored scores can say how human the copy reads. */
export function needsSlopFallback(validationJson: unknown): boolean {
  const stored = parseStoredValidation(validationJson)
  if (!stored) return true
  return !stored.slop && !stored.scores.human_score
}

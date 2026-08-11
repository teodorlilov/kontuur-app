/**
 * Deterministic scoring engine — pure functions that compute scores from LLM detections.
 * No LLM dependency, no side effects, fully unit-testable.
 *
 * Core principle: LLM detects issues, this module computes the numbers.
 * (Lean 2026-07: overall/human scores are model-provided; only language and
 * grounding remain deterministic.)
 */

import { LANGUAGE_PASS_THRESHOLD, REWRITE_SCORE_THRESHOLD } from '@/lib/content-rules/constants'
import { LANGUAGE_ISSUE_WEIGHTS } from '@/ai/validation/criteria'
import type {
  SlopDetection,
  LanguageIssueType,
  SourceGroundingIssue,
} from '@/ai/validation/types'

// ---------------------------------------------------------------------------
// Language scoring
// ---------------------------------------------------------------------------

export interface LanguageScoreInput {
  issues: Array<{ type: LanguageIssueType }>
  /** When true, all issues were auto-corrected — score reflects the corrected text. */
  corrected?: boolean
}

export interface ComputedLanguageScore {
  language_score: number
  passes: boolean
}

export function computeLanguageScore(input: LanguageScoreInput): ComputedLanguageScore {
  if (input.corrected) {
    return { language_score: 10, passes: true }
  }

  const penalty = input.issues.reduce((sum, issue) => {
    return sum + (LANGUAGE_ISSUE_WEIGHTS[issue.type] ?? 0)
  }, 0)

  const language_score = Math.max(1, Math.round(10 - penalty))
  const passes = language_score >= LANGUAGE_PASS_THRESHOLD && input.issues.length === 0

  return { language_score, passes }
}

// ---------------------------------------------------------------------------
// Grounding scoring
// ---------------------------------------------------------------------------

export interface GroundingScoreInput {
  flagged_claims: Array<{ status: 'grounded' | 'ungrounded' | 'partially_grounded' }>
}

export interface ComputedGroundingScore {
  grounding_score: number
  grounded: boolean
}

export function computeGroundingScore(input: GroundingScoreInput): ComputedGroundingScore {
  const total = input.flagged_claims.length
  if (total === 0) {
    return { grounding_score: 10, grounded: true }
  }

  let groundedCount = 0
  let partialCount = 0
  for (const claim of input.flagged_claims) {
    if (claim.status === 'grounded') groundedCount++
    else if (claim.status === 'partially_grounded') partialCount++
  }

  const grounding_score = Math.max(
    1,
    Math.round((10 * (groundedCount + 0.5 * partialCount)) / total)
  )
  const grounded = grounding_score === 10

  return { grounding_score, grounded }
}

/** Source score for ValidationScores — null when no source claims were evaluated. */
export function computeSourceScore(claims: SourceGroundingIssue[] | null): number | null {
  if (claims === null) return null
  return computeGroundingScore({ flagged_claims: claims }).grounding_score
}

// ---------------------------------------------------------------------------
// Slop derivation
// ---------------------------------------------------------------------------

interface SlopInput {
  human_score: number | null
  ai_tells: string[]
  worst_offending_phrase: string | null
}

export function deriveSlopFromQuality(quality: SlopInput): SlopDetection {
  return {
    // null, not false — an unjudged post has not been accused of anything.
    reads_as_human:
      quality.human_score === null ? null : quality.human_score >= REWRITE_SCORE_THRESHOLD,
    ai_tells_found: quality.ai_tells,
    worst_offending_phrase: quality.worst_offending_phrase,
    human_authenticity_score: quality.human_score,
  }
}

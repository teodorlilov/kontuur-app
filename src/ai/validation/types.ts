/**
 * All validation types — single source of truth.
 * Import shared types from their existing locations; do NOT redefine them.
 *
 * Lean shape (2026-07): scores come from the model, per-criterion pass/fail
 * rows were retired — failures surface as actionable `issues` entries instead.
 */

import type { SlideText } from '@/types/slide'

// ---- Issue taxonomy ----

export type LanguageIssueType =
  | 'anglicism'
  | 'calque'
  | 'grammar'
  | 'formality'
  | 'register'
  | 'mixed_script'
  | 'vocabulary'
  | 'instructions'

export type ClaimStatus = 'grounded' | 'ungrounded' | 'partially_grounded'

// ---- Criterion results ----

/** Collapsed carousel structure verdict — per-rule checklists were retired. */
export interface StructureResult {
  passes: boolean
  notes: string[]
}

export interface ValidationCriteria {
  ai_tells: string[]
  worst_offending_phrase: string | null
  /**
   * Collapsed pass/fail with failure notes. Carousels always carry one; a single
   * post carries one only when the code-side format guard fails (caption written
   * as a carousel) — otherwise null, which the UI reads as "not a carousel".
   */
  structure_followed: StructureResult | null
  /** null when no source present */
  source_claims: SourceGroundingIssue[] | null
  health_compliant: boolean | null
  issues: QualityIssue[]
}

// ---- Score dimensions ----

export interface ValidationScores {
  /**
   * null when the judge did not run. A post nobody read must not carry a number —
   * the fallback that used to fill this cleared every threshold, so a failed call
   * rendered as a confident passing score over a check that never happened.
   * `source_score` has modelled absence this way since it shipped.
   */
  overall_score: number | null
  /** Authenticity score — used for slop detection threshold. null when unjudged. */
  human_score: number | null
  /** null when the language judge did not run — same absence rule as overall_score. */
  language_score: number | null
  source_score: number | null
}

export interface QualityIssue {
  type: string
  description: string
}

export interface LanguageIssue {
  type: LanguageIssueType
  original_text: string
  issue_description: string
  suggested_fix: string
  /**
   * Whether the fix verifiably reached the saved copy — stamped when
   * corrections are applied, so review can tell a receipt ("fixed before you
   * saw it") from a warning ("flagged, but the quoted phrase was not found").
   * Absent on rows stored before this field existed and on verdicts whose
   * corrections have not been applied yet.
   */
  applied?: boolean
}

export interface LanguageValidationResult {
  passes: boolean
  /** null when the language judge did not run. */
  language_score: number | null
  issues: LanguageIssue[]
  corrected_text: string | null
  corrected_slides?: SlideText[] | null
}

export interface SlopDetection {
  /** null when unjudged — false would be an accusation nobody made. */
  reads_as_human: boolean | null
  ai_tells_found: string[]
  worst_offending_phrase: string | null
  human_authenticity_score: number | null
}

export interface SourceGroundingIssue {
  claim: string
  status: ClaimStatus
  source_evidence: string | null
}

export interface SourceGroundingResult {
  grounded: boolean
  grounding_score: number
  flagged_claims: SourceGroundingIssue[]
}

// ---- Main output ----

export interface PostValidationResult {
  criteria: ValidationCriteria
  scores: ValidationScores
  language: LanguageValidationResult
  slop: SlopDetection
  sourceGrounding?: SourceGroundingResult
  qualityScore: number | null
}

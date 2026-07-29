/**
 * All validation types — single source of truth.
 * Import shared types from their existing locations; do NOT redefine them.
 *
 * Lean shape (2026-07): scores come from the model, per-criterion pass/fail
 * rows were retired — failures surface as actionable `issues` entries instead.
 */

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
  /** null for single posts; carousels get a collapsed pass/fail with failure notes */
  structure_followed: StructureResult | null
  /** null when no source present */
  source_claims: SourceGroundingIssue[] | null
  health_compliant: boolean | null
  issues: QualityIssue[]
}

// ---- Score dimensions ----

export interface ValidationScores {
  overall_score: number
  /** Authenticity score — used for slop detection threshold */
  human_score: number
  language_score: number
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
}

export interface LanguageValidationResult {
  passes: boolean
  language_score: number
  issues: LanguageIssue[]
  corrected_text: string | null
  corrected_slides?: Array<{ headline: string; body: string }> | null
}

export interface SlopDetection {
  reads_as_human: boolean
  ai_tells_found: string[]
  worst_offending_phrase: string | null
  human_authenticity_score: number
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
  corrected_text: string | null
  corrected_slides?: Array<{ headline: string; body: string }> | null
}

// ---- Main output ----

export interface PostValidationResult {
  criteria: ValidationCriteria
  scores: ValidationScores
  language: LanguageValidationResult
  slop: SlopDetection
  sourceGrounding?: SourceGroundingResult
  qualityScore: number
  validationWarnings: string[]
}

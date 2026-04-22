/**
 * All validation types — single source of truth.
 * Import shared types from their existing locations; do NOT redefine them.
 */

// ---- Verdicts ----

export type HookVerdict = 'stops_scroll' | 'clear_value' | 'generic' | 'buries_lead' | 'no_hook'
export type CtaVerdict =
  | 'natural_specific'
  | 'clear_relevant'
  | 'generic'
  | 'weak_mismatched'
  | 'missing'

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

// ---- Criterion-level results ----

export interface CriterionResult {
  passes: boolean
  gap: string | null
}

export interface StructureCheck {
  rule: string
  passes: boolean
  note: string | null
}

// ---- Criterion breakdown ----

export interface ValidationCriteria {
  niche_fit: CriterionResult
  audience_match: CriterionResult
  /** null when no targetPillar was provided */
  pillar_match: CriterionResult | null
  theme_adherence: CriterionResult
  hook: { verdict: HookVerdict; note: string | null }
  cta: { verdict: CtaVerdict; note: string | null }
  /** null only for single posts with no declaredStructure; carousels always have this */
  structure_followed: { checks: StructureCheck[]; passes: boolean } | null
  ai_tells: string[]
  worst_offending_phrase: string | null
  brand_voice: CriterionResult
  formality: CriterionResult
  /** null when no source present */
  source_claims: SourceGroundingIssue[] | null
  health_compliant: boolean | null
  issues: QualityIssue[]
}

// ---- Score dimensions ----

export interface ValidationScores {
  brief_score: number
  craft_score: number
  voice_score: number
  language_score: number
  language_naturalness_score: number
  language_register_score: number
  /** Authenticity score — used for slop detection threshold */
  human_score: number
  source_score: number | null
  overall_score: number
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
  language_naturalness_score?: number
  language_register_score?: number
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

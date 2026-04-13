// ---- Scoring verdicts ----

export type HookVerdict = 'stops_scroll' | 'clear_value' | 'generic' | 'buries_lead' | 'no_hook'
export type CtaVerdict =
  | 'natural_specific'
  | 'clear_relevant'
  | 'generic'
  | 'weak_mismatched'
  | 'missing'

export interface QualityIssue {
  type: string
  description: string
}

// ---- Quality Scores ----

export interface QualityScores {
  human_score: number
  hook_score: number
  cta_score: number
  criteria_score: number
  quality_score_avg: number
  hook_verdict: HookVerdict
  cta_verdict: CtaVerdict
  brand_voice_match: boolean
  brand_voice_deviation: string | null
  audience_targeting: boolean
  audience_gap: string | null
  niche_specificity: boolean
  niche_gap: string | null
  ai_tells: string[]
  worst_offending_phrase: string | null
  issues: QualityIssue[]
  structure_is_predictable: boolean
  structure_used: string | null
  formality_consistent: boolean
  formality_violation: string | null
  source_fidelity_ok: boolean | null
  health_compliant: boolean | null
}

/** @deprecated Use QualityScores — identical shape */
export type CarouselQuality = QualityScores

// ---- Quality Result (discriminated union) ----

export interface SingleQualityResult extends QualityScores {
  kind: 'single'
}

export interface CarouselQualityResult extends QualityScores {
  kind: 'carousel'
}

/** Discriminated union — narrow with `quality.kind` */
export type QualityResult = SingleQualityResult | CarouselQualityResult

// ---- Language ----

export type LanguageIssueType =
  | 'anglicism'
  | 'calque'
  | 'grammar'
  | 'formality'
  | 'register'
  | 'mixed_script'
  | 'vocabulary'

export interface LanguageIssue {
  type: LanguageIssueType
  original_text: string
  issue_description: string
  suggested_fix: string
}

export interface LanguageValidation {
  passes: boolean
  language_score: number
  issues: LanguageIssue[]
  corrected_text: string | null
  corrected_slides?: Array<{ headline: string; body: string }> | null
}

/** Alias for consistency with validator return type */
export type LanguageValidationResult = LanguageValidation

// ---- Slop ----

export interface SlopDetection {
  reads_as_human: boolean
  ai_tells_found: string[]
  worst_offending_phrase: string | null
  human_authenticity_score: number
}

// ---- Source Grounding ----

export interface SourceGroundingIssue {
  claim: string
  status: 'grounded' | 'ungrounded' | 'partially_grounded'
  source_evidence: string | null
}

export interface SourceGroundingResult {
  grounded: boolean
  grounding_score: number
  flagged_claims: SourceGroundingIssue[]
  corrected_text: string | null
  corrected_slides?: Array<{ headline: string; body: string }> | null
}

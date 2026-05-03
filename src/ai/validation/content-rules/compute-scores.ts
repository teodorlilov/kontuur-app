/**
 * Deterministic scoring engine — pure functions that compute scores from LLM detections.
 * No LLM dependency, no side effects, fully unit-testable.
 *
 * Core principle: LLM detects issues, this module computes the numbers.
 */

import { LANGUAGE_PASS_THRESHOLD, REWRITE_SCORE_THRESHOLD } from '@/lib/content-rules/constants'
import {
  HOOK_VERDICTS,
  CTA_VERDICTS,
  HUMAN_SCORE_PENALTIES,
  CRITERIA_PENALTIES,
  LANGUAGE_ISSUE_WEIGHTS,
  DIMENSION_BY_ISSUE_TYPE,
} from '@/ai/validation/criteria'
import type {
  HookVerdict,
  CtaVerdict,
  SlopDetection,
  LanguageIssueType,
  LanguageIssue,
  ValidationCriteria,
  ValidationScores,
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
// Language sub-scores (naturalness + register dimensions)
// ---------------------------------------------------------------------------

export interface ComputedLanguageSubScores {
  naturalness_score: number
  register_score: number
  language_score: number
}

/**
 * Splits language issues into naturalness and register dimensions using the static
 * DIMENSION_BY_ISSUE_TYPE mapping. No LLM classification needed.
 */
export function computeLanguageSubScores(issues: LanguageIssue[]): ComputedLanguageSubScores {
  let naturalnessPenalty = 0
  let registerPenalty = 0

  for (const issue of issues) {
    const weight = LANGUAGE_ISSUE_WEIGHTS[issue.type] ?? 0
    const dimension = DIMENSION_BY_ISSUE_TYPE[issue.type]
    if (dimension === 'naturalness') naturalnessPenalty += weight
    else if (dimension === 'register') registerPenalty += weight
  }

  const naturalness_score = Math.max(1, Math.round(10 - naturalnessPenalty))
  const register_score = Math.max(1, Math.round(10 - registerPenalty))
  // Naturalness 55%, register 45%
  const language_score = Math.max(1, Math.round(naturalness_score * 0.55 + register_score * 0.45))

  return { naturalness_score, register_score, language_score }
}

// ---------------------------------------------------------------------------
// Quality scoring
// ---------------------------------------------------------------------------

/** Hook verdict → base score mapping. */
const HOOK_VERDICT_SCORES = Object.fromEntries(HOOK_VERDICTS.map((v) => [v.id, v.score])) as Record<
  HookVerdict,
  number
>

/** CTA verdict → base score mapping. */
const CTA_VERDICT_SCORES = Object.fromEntries(CTA_VERDICTS.map((v) => [v.id, v.score])) as Record<
  CtaVerdict,
  number
>

/** Quality issue types that penalize the human (authenticity) score. */
const HUMAN_SCORE_ISSUE_PENALTIES: Record<string, number> = {
  no_personality: HUMAN_SCORE_PENALTIES.NO_PERSONALITY,
  too_polished: HUMAN_SCORE_PENALTIES.TOO_POLISHED,
  filler_content: HUMAN_SCORE_PENALTIES.FILLER_CONTENT,
  repetitive: HUMAN_SCORE_PENALTIES.REPETITIVE,
  off_brand: HUMAN_SCORE_PENALTIES.OFF_BRAND,
  wrong_audience: HUMAN_SCORE_PENALTIES.WRONG_AUDIENCE,
}

/** Quality issue types that penalize the hook score. */
const HOOK_ISSUE_PENALTIES: Record<string, number> = {
  weak_hook: 1,
  buried_lead: 1,
}

/** Quality issue types that penalize the CTA score. */
const CTA_ISSUE_PENALTIES: Record<string, number> = {
  generic_cta: 1,
}

export interface QualityDetections {
  ai_tells: string[]
  issues: Array<{ type: string }>
  hook_verdict: HookVerdict
  cta_verdict: CtaVerdict
  brand_voice_match: boolean
  audience_targeting: boolean
  niche_specificity: boolean
  /** Structure used by the post — enables CTA exemption for no-CTA structures. */
  structure_used?: string | null
}

export interface ComputedQualityScores {
  human_score: number
  hook_score: number
  cta_score: number
  criteria_score: number
  quality_score_avg: number
}

// ---------------------------------------------------------------------------
// Criteria scoring
// ---------------------------------------------------------------------------

export interface CriteriaDetections {
  formality_consistent: boolean
  source_fidelity_ok: boolean | null
  health_compliant: boolean | null
}

export function computeCriteriaScore(d: CriteriaDetections): number {
  let penalty = 0
  if (!d.formality_consistent) penalty += CRITERIA_PENALTIES.FORMALITY_VIOLATION
  if (d.source_fidelity_ok === false) penalty += CRITERIA_PENALTIES.SOURCE_FIDELITY_FAIL
  if (d.health_compliant === false) penalty += CRITERIA_PENALTIES.HEALTH_CONTENT_VIOLATION
  return Math.max(1, Math.round(10 - penalty))
}

export function computeQualityScores(
  detections: QualityDetections,
  criteria_score?: number
): ComputedQualityScores {
  // Human score: 10 minus penalties from AI tells, issues, and brand checks
  const issuePenalty = detections.issues.reduce((sum, issue) => {
    return sum + (HUMAN_SCORE_ISSUE_PENALTIES[issue.type] ?? 0)
  }, 0)

  const human_score = Math.max(
    1,
    Math.round(
      10 -
        Math.min(
          detections.ai_tells.length * HUMAN_SCORE_PENALTIES.AI_TELL,
          HUMAN_SCORE_PENALTIES.AI_TELL_CAP
        ) -
        issuePenalty -
        (detections.brand_voice_match ? 0 : HUMAN_SCORE_PENALTIES.BRAND_VOICE_MISMATCH) -
        (detections.niche_specificity ? 0 : HUMAN_SCORE_PENALTIES.NICHE_NOT_SPECIFIC) -
        (detections.audience_targeting ? 0 : HUMAN_SCORE_PENALTIES.AUDIENCE_NOT_TARGETED)
    )
  )

  // Hook score: verdict base minus issue penalties
  const hookPenalty = detections.issues.reduce((sum, issue) => {
    return sum + (HOOK_ISSUE_PENALTIES[issue.type] ?? 0)
  }, 0)
  const hook_score = Math.max(1, HOOK_VERDICT_SCORES[detections.hook_verdict] - hookPenalty)

  // CTA score: verdict base minus issue penalties
  const ctaPenalty = detections.issues.reduce((sum, issue) => {
    return sum + (CTA_ISSUE_PENALTIES[issue.type] ?? 0)
  }, 0)
  const cta_score = Math.max(1, CTA_VERDICT_SCORES[detections.cta_verdict] - ctaPenalty)

  // Criteria score defaults to 10 when not provided (backwards compatibility)
  const cs = criteria_score ?? 10

  const quality_score_avg = Math.round((human_score + hook_score + cta_score + cs) / 4)

  return { human_score, hook_score, cta_score, criteria_score: cs, quality_score_avg }
}

/** Parse a verdict string from LLM, defaulting to 'generic' if unrecognized. */
export function safeParseHookVerdict(value: unknown): HookVerdict {
  const valid: HookVerdict[] = ['stops_scroll', 'clear_value', 'generic', 'buries_lead', 'no_hook']
  return typeof value === 'string' && valid.includes(value as HookVerdict)
    ? (value as HookVerdict)
    : 'generic'
}

export function safeParseCtaVerdict(value: unknown): CtaVerdict {
  const valid: CtaVerdict[] = [
    'natural_specific',
    'clear_relevant',
    'generic',
    'weak_mismatched',
    'missing',
  ]
  return typeof value === 'string' && valid.includes(value as CtaVerdict)
    ? (value as CtaVerdict)
    : 'generic'
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

// ---------------------------------------------------------------------------
// Slop derivation
// ---------------------------------------------------------------------------

interface SlopInput {
  human_score: number
  ai_tells: string[]
  worst_offending_phrase: string | null
}

export function deriveSlopFromQuality(quality: SlopInput): SlopDetection {
  return {
    reads_as_human: quality.human_score >= REWRITE_SCORE_THRESHOLD,
    ai_tells_found: quality.ai_tells,
    worst_offending_phrase: quality.worst_offending_phrase,
    human_authenticity_score: quality.human_score,
  }
}

// ---------------------------------------------------------------------------
// New score dimensions (brief / craft / voice / source / overall)
// ---------------------------------------------------------------------------

/**
 * Brief adherence score: 10 − penalties for failed checks.
 * When pillar is not provided its weight is redistributed proportionally across the other three.
 */
export function computeBriefScore(c: ValidationCriteria, hasPillar: boolean): number {
  let penalty = 0
  if (!c.niche_fit.passes) penalty += hasPillar ? 2.5 : 3.1
  if (!c.audience_match.passes) penalty += hasPillar ? 2.0 : 2.5
  if (hasPillar && c.pillar_match !== null && !c.pillar_match.passes) penalty += 2.0
  if (!c.theme_adherence.passes) penalty += hasPillar ? 2.5 : 3.1
  return Math.max(1, Math.round(10 - penalty))
}

/**
 * Craft score: average of hook, CTA, and authenticity components.
 */
export function computeCraftScore(c: ValidationCriteria): number {
  const hookScore = HOOK_VERDICT_SCORES[c.hook.verdict] ?? 5
  const hookPenalty = c.issues.reduce((sum, i) => sum + (HOOK_ISSUE_PENALTIES[i.type] ?? 0), 0)
  const hook = Math.max(1, hookScore - hookPenalty)

  const ctaScore = CTA_VERDICT_SCORES[c.cta.verdict] ?? 5
  const ctaPenalty = c.issues.reduce((sum, i) => sum + (CTA_ISSUE_PENALTIES[i.type] ?? 0), 0)
  const cta = Math.max(1, ctaScore - ctaPenalty)

  const authenticity = Math.max(6, 10 - c.ai_tells.length * 1.0)

  return Math.max(1, Math.round((hook + cta + authenticity) / 3))
}

/**
 * Voice score: 10 − penalties for brand voice and formality failures.
 */
export function computeVoiceScore(c: ValidationCriteria): number {
  let penalty = 0
  if (!c.brand_voice.passes) penalty += 3.0
  if (!c.formality.passes) penalty += 2.5
  return Math.max(1, Math.round(10 - penalty))
}

/**
 * Source score: null when no source present; otherwise derived from claim verdicts.
 */
export function computeSourceScore(claims: SourceGroundingIssue[] | null): number | null {
  if (claims === null) return null
  const { grounding_score } = computeGroundingScore({ flagged_claims: claims })
  return grounding_score
}

/**
 * Overall score: weighted average of all applicable dimensions.
 * Weights shift when source score is present.
 */
export function computeOverallScore(s: Omit<ValidationScores, 'overall_score'>): number {
  if (s.source_score !== null) {
    // With source: brief 25%, craft 25%, voice 15%, language 15%, source 20%
    return Math.max(
      1,
      Math.round(
        s.brief_score * 0.25 +
          s.craft_score * 0.25 +
          s.voice_score * 0.15 +
          s.language_score * 0.15 +
          s.source_score * 0.2
      )
    )
  }
  // Without source: brief 30%, craft 30%, voice 20%, language 20%
  return Math.max(
    1,
    Math.round(
      s.brief_score * 0.3 +
        s.craft_score * 0.3 +
        s.voice_score * 0.2 +
        s.language_score * 0.2
    )
  )
}

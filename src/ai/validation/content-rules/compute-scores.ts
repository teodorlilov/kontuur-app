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
  CTA_EXEMPT_STRUCTURES,
  PLATFORM_LIMITS,
} from '@/ai/validation/content-rules/validation-criteria'
import type { SentenceVarietyResult } from '@/ai/validation/content-rules/text-analysis'
import type { HookVerdict, CtaVerdict, SlopDetection } from '@/types/api'

// ---------------------------------------------------------------------------
// Language scoring
// ---------------------------------------------------------------------------

export type LanguageIssueType = 'anglicism' | 'calque' | 'grammar' | 'formality' | 'register' | 'mixed_script' | 'vocabulary'

/** Penalty per language issue type (deducted from 10). */
const LANGUAGE_ISSUE_WEIGHTS: Record<LanguageIssueType, number> = {
  grammar: 1.5,
  mixed_script: 2.0,
  calque: 1.5,
  anglicism: 1.0,
  formality: 1.0,
  register: 0.75,
  vocabulary: 1.0,
}

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
// Quality scoring
// ---------------------------------------------------------------------------

/** Hook verdict → base score mapping (derived from evaluation-criteria.ts). */
const HOOK_VERDICT_SCORES = Object.fromEntries(
  HOOK_VERDICTS.map((v) => [v.id, v.score])
) as Record<HookVerdict, number>

/** CTA verdict → base score mapping (derived from evaluation-criteria.ts). */
const CTA_VERDICT_SCORES = Object.fromEntries(
  CTA_VERDICTS.map((v) => [v.id, v.score])
) as Record<CtaVerdict, number>

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
  // From LLM (semantic understanding required)
  opener_follows_rules: boolean
  structure_is_predictable: boolean
  formality_consistent: boolean
  source_fidelity_ok: boolean | null
  health_compliant: boolean | null
  // From deterministic text analysis
  sentenceVariety: SentenceVarietyResult
  wordCount: number
  platform: string
  hashtagCount: number
}

export function computeCriteriaScore(d: CriteriaDetections): number {
  let penalty = 0
  if (!d.opener_follows_rules) penalty += CRITERIA_PENALTIES.OPENER_VIOLATION
  if (d.structure_is_predictable) penalty += CRITERIA_PENALTIES.STRUCTURE_PREDICTABLE
  if (!d.sentenceVariety.passes) penalty += CRITERIA_PENALTIES.SENTENCE_VARIETY_FAIL
  if (!d.formality_consistent) penalty += CRITERIA_PENALTIES.FORMALITY_VIOLATION
  if (d.source_fidelity_ok === false) penalty += CRITERIA_PENALTIES.SOURCE_FIDELITY_FAIL
  if (d.health_compliant === false) penalty += CRITERIA_PENALTIES.HEALTH_CONTENT_VIOLATION
  penalty += computeWordCountPenalty(d.wordCount, d.platform)
  penalty += computeHashtagPenalty(d.hashtagCount, d.platform)
  return Math.max(1, Math.round(10 - penalty))
}

function computeWordCountPenalty(wordCount: number, platform: string): number {
  const limits = PLATFORM_LIMITS[platform]
  if (!limits) return 0
  if (wordCount < limits.wordCount.min || wordCount > limits.wordCount.max) return CRITERIA_PENALTIES.WORD_COUNT_VIOLATION
  return 0
}

function computeHashtagPenalty(hashtagCount: number, platform: string): number {
  const limits = PLATFORM_LIMITS[platform]
  if (!limits) return 0
  if (hashtagCount > limits.hashtags.max) return CRITERIA_PENALTIES.HASHTAG_VIOLATION
  return 0
}

export function computeQualityScores(
  detections: QualityDetections,
  criteria_score?: number,
): ComputedQualityScores {
  // Human score: 10 minus penalties from AI tells, issues, and brand checks
  const issuePenalty = detections.issues.reduce((sum, issue) => {
    return sum + (HUMAN_SCORE_ISSUE_PENALTIES[issue.type] ?? 0)
  }, 0)

  const human_score = Math.max(1, Math.round(
    10
    - Math.min(detections.ai_tells.length * HUMAN_SCORE_PENALTIES.AI_TELL, HUMAN_SCORE_PENALTIES.AI_TELL_CAP)
    - issuePenalty
    - (detections.brand_voice_match ? 0 : HUMAN_SCORE_PENALTIES.BRAND_VOICE_MISMATCH)
    - (detections.niche_specificity ? 0 : HUMAN_SCORE_PENALTIES.NICHE_NOT_SPECIFIC)
    - (detections.audience_targeting ? 0 : HUMAN_SCORE_PENALTIES.AUDIENCE_NOT_TARGETED)
  ))

  // Hook score: verdict base minus issue penalties
  const hookPenalty = detections.issues.reduce((sum, issue) => {
    return sum + (HOOK_ISSUE_PENALTIES[issue.type] ?? 0)
  }, 0)
  const hook_score = Math.max(1, HOOK_VERDICT_SCORES[detections.hook_verdict] - hookPenalty)

  // CTA score: verdict base minus issue penalties, with CTA exemption
  const ctaPenalty = detections.issues.reduce((sum, issue) => {
    return sum + (CTA_ISSUE_PENALTIES[issue.type] ?? 0)
  }, 0)
  const isCtaExempt = detections.cta_verdict === 'missing'
    && detections.structure_used != null
    && CTA_EXEMPT_STRUCTURES.includes(detections.structure_used)
  const cta_score = isCtaExempt
    ? 10
    : Math.max(1, CTA_VERDICT_SCORES[detections.cta_verdict] - ctaPenalty)

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
  const valid: CtaVerdict[] = ['natural_specific', 'clear_relevant', 'generic', 'weak_mismatched', 'missing']
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

  const grounding_score = Math.max(1, Math.round(10 * (groundedCount + 0.5 * partialCount) / total))
  const grounded = grounding_score === 10

  return { grounding_score, grounded }
}

// ---------------------------------------------------------------------------
// Slop derivation (DRY — extracted from 3 duplicate locations)
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

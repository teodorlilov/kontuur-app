import {
  MIN_SHORT_SENTENCE_WORDS,
  MIN_LONG_SENTENCE_WORDS,
  MAX_CONSECUTIVE_SIMILAR_LENGTH,
  CTA_EXEMPT_STRUCTURES,
  PLATFORM_LIMITS,
  formatAllowedOpeners,
  formatBannedOpeners,
  formatStructures,
  formatWordCount,
  formatHashtagRules,
  formatHealthRules,
  type PlatformLimits,
} from '@/ai/generation/generation-criteria'
import { formatFormalityRules } from '@/ai/generation/prompts/formality-guidance'
import type { LanguageConfig } from '@/lib/clients/language-rules'

export { CTA_EXEMPT_STRUCTURES, PLATFORM_LIMITS }
export type { PlatformLimits }

// ---- AI Tell Patterns ----
// 6 concrete structural patterns — each fires on a distinct signal.
export const AI_TELL_PATTERNS: readonly string[] = [
  'Perfectly balanced sentence structure — every sentence has similar length and rhythm, no variety',
  'Triple adjective stacking ("comprehensive, innovative, cutting-edge") — three or more adjectives in a row',
  'Unearned authority phrases ("As a leading...", "We pride ourselves on...", "With years of experience...")',
  'Hollow setup sentences that delay the point — the first 1-2 sentences could be deleted without losing meaning',
  'Essay transition phrases ("Furthermore", "Additionally", "Moreover", "In conclusion")',
  'Sentence structure or phrasing that reads as translated from another language rather than written natively',
] as const

// ---- Issue Type Definitions ----
// Used by validate-quality.ts to give the LLM precise definitions for each issue type.
export const ISSUE_TYPE_DEFINITIONS: Record<string, string> = {
  weak_hook: 'Opening line fails to create curiosity or stop scrolling',
  generic_cta: 'CTA is generic and could appear on any post',
  no_personality: 'Post sounds like it could come from any brand',
  too_polished: 'Overly balanced rhythm that reads as carefully crafted rather than natural',
  buried_lead: 'The most interesting point is hidden after filler opening lines',
  filler_content: 'Sentences that add no new information or insight',
  repetitive: 'Same idea or phrasing repeated in different words',
  off_brand: 'Tone or voice drifts from the brand identity',
  wrong_audience: 'Content targets a different audience than specified',
}

// ---- Formality Evaluation Criteria ----
// Now DB-driven via LanguageConfig.formalityRules — shared with generation.
// The validator receives the SAME rules generation was told to follow.

// ---- Hook & CTA Verdict Definitions ----
export interface VerdictDefinition {
  readonly id: string
  readonly score: number
  readonly description: string
}

export const HOOK_VERDICTS: readonly VerdictDefinition[] = [
  { id: 'stops_scroll', score: 10, description: 'Uses one of the allowed opener types brilliantly with specific detail — reader MUST keep reading' },
  { id: 'clear_value', score: 8, description: 'Uses one of the allowed opener types but could be sharper or more specific' },
  { id: 'generic', score: 5, description: "Doesn't clearly match any allowed opener type, or is too vague to stop scrolling" },
  { id: 'buries_lead', score: 3, description: 'Uses a banned opener type before eventually getting to value' },
  { id: 'no_hook', score: 1, description: 'Uses a banned opener type with no value at all, or opens with filler' },
] as const

export const CTA_VERDICTS: readonly VerdictDefinition[] = [
  { id: 'natural_specific', score: 10, description: "One CTA, specific to this post's topic, low-pressure — feels like advice not marketing" },
  { id: 'clear_relevant', score: 8, description: 'One CTA, relevant but expected ("Link in bio", "Save this for later")' },
  { id: 'generic', score: 5, description: 'Could be on any post ("Follow for more!", "Share your thoughts!")' },
  { id: 'weak_mismatched', score: 3, description: "Multiple CTAs, or CTA doesn't match content, or high-pressure sales language" },
  { id: 'missing', score: 1, description: 'No CTA present — acceptable for MYTH-BREAKER or CONFESSION structures' },
] as const

// ---- Penalty Weights ----
export const HUMAN_SCORE_PENALTIES = {
  AI_TELL: 1.0,
  AI_TELL_CAP: 4.0,
  BRAND_VOICE_MISMATCH: 1.5,
  NICHE_NOT_SPECIFIC: 1.5,
  AUDIENCE_NOT_TARGETED: 1.0,
  NO_PERSONALITY: 1.5,
  TOO_POLISHED: 1.0,
  FILLER_CONTENT: 0.75,
  REPETITIVE: 0.75,
  OFF_BRAND: 1.5,
  WRONG_AUDIENCE: 1.0,
} as const

export const CRITERIA_PENALTIES = {
  OPENER_VIOLATION: 2.0,
  STRUCTURE_PREDICTABLE: 1.5,
  SENTENCE_VARIETY_FAIL: 1.0,
  WORD_COUNT_VIOLATION: 0.75,
  HASHTAG_VIOLATION: 0.5,
  BANNED_PHRASE_FOUND: 1.0,
  BANNED_PHRASE_CAP: 3.0,
  FORMALITY_VIOLATION: 1.5,
  SOURCE_FIDELITY_FAIL: 1.5,
  HEALTH_CONTENT_VIOLATION: 2.0,
} as const

// ---- Format helpers for validator prompts ----

export function formatAiTellPatterns(): string {
  return AI_TELL_PATTERNS.map((p) => `- ${p}`).join('\n')
}

export function formatIssueTypes(): string {
  return Object.entries(ISSUE_TYPE_DEFINITIONS)
    .map(([type, desc]) => `- ${type}: ${desc}`)
    .join('\n')
}

export function formatHookVerdicts(): string {
  return HOOK_VERDICTS.map((v) => `- "${v.id}": ${v.description}`).join('\n')
}

export function formatCtaVerdicts(): string {
  return CTA_VERDICTS.map((v) => `- "${v.id}": ${v.description}`).join('\n')
}

export function buildCriteriaChecklist(ctx: {
  platform?: string
  hasSource?: boolean
  isHealthClient?: boolean
  languageConfig?: LanguageConfig
}): string {
  const sections: string[] = []
  const lc = ctx.languageConfig
  const formality = lc?.formality ?? 'neutral'

  sections.push(`GENERATION CRITERIA — evaluate compliance:

[] OPENER: Must be one of:
${formatAllowedOpeners(lc)}
   BANNED openers:
${formatBannedOpeners()}

[] STRUCTURE: Must NOT be predictable problem→solution→CTA.
   Allowed structures: ${formatStructures(formality)}

[] SENTENCES: At least one sentence under ${MIN_SHORT_SENTENCE_WORDS} words
   and one over ${MIN_LONG_SENTENCE_WORDS} words. Never ${MAX_CONSECUTIVE_SIMILAR_LENGTH + 1}
   consecutive sentences of similar length.

[] REGISTER:
${formatFormalityRules(lc ?? null)}`)

  if (ctx.platform) {
    sections.push(`[] WORD COUNT: ${formatWordCount(ctx.platform)}
[] HASHTAGS: ${formatHashtagRules(ctx.platform)}`)
  }

  if (ctx.hasSource) {
    sections.push(`[] SOURCE FIDELITY: Every specific claim must be grounded in the provided source material. No invented details.
[] NOT A SUMMARY: Post focuses on 1-2 angles from the source, not a condensed overview of the entire article.`)
  }

  if (ctx.isHealthClient) {
    sections.push(`[] HEALTH COMPLIANCE: ${formatHealthRules()}`)
  }

  return sections.join('\n\n')
}

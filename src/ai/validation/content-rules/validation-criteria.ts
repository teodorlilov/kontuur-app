import {
  MIN_SHORT_SENTENCE_WORDS,
  MIN_LONG_SENTENCE_WORDS,
  MAX_CONSECUTIVE_SIMILAR_LENGTH,
  CTA_EXEMPT_STRUCTURES,
  formatStructureDescriptions,
  formatWordCount,
  formatHashtagRules,
  formatHealthRules,
} from '@/ai/generation/generation-criteria'
import { formatFormalityRules } from '@/ai/generation/prompts/formality-guidance'
import { SOURCE_GROUNDING_RULES } from '@/ai/generation/prompts/source-grounding'
import type { LanguageConfig } from '@/lib/clients/language-rules'


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
  { id: 'stops_scroll', score: 10, description: 'Opener is brilliant, specific, and perfectly matched to theme and register — reader MUST keep reading' },
  { id: 'clear_value', score: 8, description: 'Opener is effective but could be sharper or more specific to the theme' },
  { id: 'generic', score: 5, description: 'Opener is too vague or generic to stop scrolling for this specific theme' },
  { id: 'buries_lead', score: 3, description: 'Opens with filler or context before eventually getting to value' },
  { id: 'no_hook', score: 1, description: 'Opens with filler, a general truth, or has no value at all' },
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
  theme?: string
  declaredStructure?: string
}): string {
  const sections: string[] = []
  const lc = ctx.languageConfig
  const formality = lc?.formality ?? 'neutral'

  // Structure section — full descriptions so validator knows each structure's rules
  let structureSection = `[] STRUCTURE: Must NOT be predictable problem→solution→CTA.
   Each structure has specific rules the post must follow:
${formatStructureDescriptions()}`

  // If we know the declared structure, add a specific compliance check
  if (ctx.declaredStructure) {
    const isCtaExempt = CTA_EXEMPT_STRUCTURES.includes(ctx.declaredStructure)
    structureSection += `\n\n[] DECLARED STRUCTURE: The generator declared "${ctx.declaredStructure}".
   Verify the post actually follows this structure's definition above.${
     isCtaExempt ? '\n   This structure explicitly forbids CTAs — a CTA present is a violation.' : ''
   }`
  }

  sections.push(`GENERATION CRITERIA — evaluate compliance:

[] OPENER: Must stop scrolling and match the ${formality} register. Effective and specific to the theme${ctx.theme ? ` "${ctx.theme}"` : ''}.

${structureSection}

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
    sections.push(`[] SOURCE FIDELITY — the generator was told to follow these rules:
${SOURCE_GROUNDING_RULES}`)
  }

  if (ctx.isHealthClient) {
    sections.push(`[] HEALTH COMPLIANCE: ${formatHealthRules()}`)
  }

  return sections.join('\n\n')
}

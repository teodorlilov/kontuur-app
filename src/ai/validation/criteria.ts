/**
 * All validation constants — single source of truth for penalty values,
 * verdict definitions, structure checklists, issue definitions, and dimension mapping.
 * No logic here — pure data.
 */

import type { LanguageIssueType } from '@/ai/validation/types'

// ---- Hook verdict definitions ----

export interface VerdictDefinition {
  readonly id: string
  readonly score: number
  readonly description: string
}

export const HOOK_VERDICTS: readonly VerdictDefinition[] = [
  {
    id: 'stops_scroll',
    score: 10,
    description:
      'References a specific result, named person/client, or concrete observation unique to this niche AND cannot be predicted by the reader after the first clause',
  },
  {
    id: 'clear_value',
    score: 8,
    description:
      'States a clear benefit or insight relevant to the target audience; no surprises but genuinely useful',
  },
  {
    id: 'generic',
    score: 5,
    description:
      'Could open any post in this industry — no niche-specific detail, no specific person, no concrete data point',
  },
  {
    id: 'buries_lead',
    score: 3,
    description:
      'The most compelling detail appears in line 2+ while line 1 is setup, context-setting, or filler',
  },
  {
    id: 'no_hook',
    score: 1,
    description:
      'First line is a brand announcement, greeting, or topic label with no reader benefit',
  },
] as const

// ---- CTA verdict definitions ----

export const CTA_VERDICTS: readonly VerdictDefinition[] = [
  {
    id: 'natural_specific',
    score: 10,
    description:
      "Contains an action verb + the specific outcome/destination (e.g. 'Book a 30-min assessment at [link]', 'DM us AUDIT to get the checklist')",
  },
  {
    id: 'clear_relevant',
    score: 8,
    description:
      "Clear action + relevant but not hyper-specific ('Learn more on our website', 'Send us a message')",
  },
  {
    id: 'generic',
    score: 5,
    description: "'Contact us', 'Follow for more', 'Like and share' — no specific action tied to post content",
  },
  {
    id: 'weak_mismatched',
    score: 3,
    description: 'CTA exists but contradicts post tone or asks for something the post did not earn',
  },
  {
    id: 'missing',
    score: 1,
    description: 'No CTA present',
  },
] as const

// ---- Carousel structure checklist ----
// Derived from buildGenerateUserCarouselPrompt rules.

export const CAROUSEL_STRUCTURE_CHECKLIST: readonly string[] = [
  'Cover slide (slide 1): Headline only — no body text. Opens a loop the reader must swipe to resolve.',
  'Content slides (2 to N-2): One distinct idea per slide. Body adds NEW information beyond the headline — does not explain/repeat it.',
  'Value/payoff slide (N-1): Emotional or informational peak — not another content slide.',
  'CTA slide (last): The slide body contains an actionable directive with a verb (e.g. "Book a consultation", "Send us a message"). The headline may provide framing ("Recover properly") — evaluate the BODY for the CTA, not the headline. Never missing.',
  'Each slide covers a DISTINCT idea — no two slides repeat the same point.',
  'Every headline names a specific mechanism, condition, technology, or result — not a topic label or empty positive.',
  'Main caption: 40-60 words. Teases the core insight without revealing all slides.',
] as const



// ---- Issue type definitions (objective, grounded in structure rules) ----

export const ISSUE_TYPE_DEFINITIONS: Record<string, string> = {
  weak_hook:
    'First sentence contains no niche-specific noun, named person, concrete number, or sensory detail; could open any post in this industry',
  generic_cta:
    'CTA contains no action verb tied to a specific service, outcome, or destination unique to this client',
  no_personality:
    'Zero brand-specific vocabulary, named client/product references, or tone markers from the declared testimonial voice',
  too_polished:
    'Three or more consecutive sentences in the 8-25 word range with no sentence shorter than 6 words or longer than 35 words',
  buried_lead:
    'The most interesting point is hidden after filler opening lines',
  filler_content:
    'Sentence restates the preceding sentence or contains only transitional connectors with no new fact or insight',
  repetitive:
    'Same idea or phrasing repeated in different words',
  off_brand:
    'Post uses vocabulary, register, or framing explicitly excluded by the declared tone or testimonial voice',
  wrong_audience:
    'Post addresses pain points, aspirations, or vocabulary belonging to a different audience segment than declared',
}

// ---- Language dimension mapping (static — no LLM classification) ----

export const DIMENSION_BY_ISSUE_TYPE: Record<LanguageIssueType, 'naturalness' | 'register'> = {
  anglicism: 'naturalness',
  calque: 'naturalness',
  mixed_script: 'naturalness',
  vocabulary: 'naturalness',
  grammar: 'naturalness',
  formality: 'register',
  register: 'register',
  instructions: 'register',
}

// ---- Penalty weights ----

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
  SENTENCE_VARIETY_FAIL: 1.0,
  WORD_COUNT_VIOLATION: 0.75,
  BANNED_PHRASE_FOUND: 1.0,
  BANNED_PHRASE_CAP: 3.0,
  FORMALITY_VIOLATION: 1.5,
  SOURCE_FIDELITY_FAIL: 1.5,
  HEALTH_CONTENT_VIOLATION: 2.0,
} as const

/** Penalty per language issue type (deducted from 10). */
export const LANGUAGE_ISSUE_WEIGHTS: Record<LanguageIssueType, number> = {
  grammar: 1.5,
  mixed_script: 2.0,
  calque: 1.5,
  anglicism: 1.0,
  formality: 1.0,
  register: 0.75,
  vocabulary: 1.0,
  instructions: 1.0,
}

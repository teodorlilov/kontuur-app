/**
 * All validation constants — single source of truth for structure checklists,
 * issue definitions, and language issue weights. No logic here — pure data.
 */

import type { LanguageIssueType } from '@/ai/validation/types'

// ---- Carousel structure checklist ----
// Single source for BOTH the generation prompt and the validator, so posts are graded
// against exactly what the generator was asked to produce.

const CAROUSEL_COVER_RULE =
  'Cover slide (slide 1): Headline only — no body text. The headline opens a loop the reader must swipe to resolve — a claim, tension, or number that demands the next slide.'

const CAROUSEL_COVER_RULE_SEMANTIC =
  'Cover slide (slide 1): The headline opens a loop the reader must swipe to resolve — a claim, tension, or number that demands the next slide.'

// Semantic rules need judgment — the LLM evaluates these on both sides.
// The headline rule is phrased as a decidable test so the generator and
// validator can't interpret "specific" differently.
const CAROUSEL_SEMANTIC_COMMON: readonly string[] = [
  'Each slide covers a DISTINCT idea — no two slides repeat the same point.',
  'Every headline states a claim someone could disagree with, OR contains a number/named entity tied to a consequence. If it could work as a textbook chapter title, it fails.',
] as const

// Mechanical rules are counted in code (check-structure.ts) — they guide the
// generator but are NEVER given to the validator LLM, which miscounts.
const CAROUSEL_MECHANICAL_COMMON: readonly string[] = [
  'Slide bodies are tight: at most ~30 words (1–2 short sentences), never a paragraph.',
  'Main caption: 40-60 words. Teases the core insight without revealing all slides.',
] as const

function carouselCtaRule(slideCount: number): string {
  return `CTA slide (slide ${slideCount}, the last): The slide body contains an actionable directive with a verb (e.g. "Book a consultation", "Send us a message"). The headline may provide framing ("Recover properly") — evaluate the BODY for the CTA, not the headline. Never missing.`
}

/**
 * Count-aware slide-role rules. The classic cover/content/payoff/CTA split needs at least
 * 4 slides — at 3 the middle roles collapse into a single core-insight slide, so a 3-slide request
 * no longer contradicts the structure (the model used to add a 4th slide to satisfy all roles).
 */
function carouselRoleRules(slideCount: number, coverRule: string): string[] {
  if (slideCount <= 3) {
    return [
      coverRule,
      'Middle slide (slide 2): The single core insight — the informational peak of the carousel. Body adds NEW information beyond the headline — does not explain/repeat it.',
      carouselCtaRule(3),
    ]
  }
  const contentRange =
    slideCount === 4
      ? 'Content slide (slide 2): One distinct idea.'
      : `Content slides (slides 2–${slideCount - 2}): One distinct idea per slide.`
  return [
    coverRule,
    `${contentRange} Body adds NEW information beyond the headline — does not explain/repeat it.`,
    `Value/payoff slide (slide ${slideCount - 1}): Emotional or informational peak — not another content slide.`,
    carouselCtaRule(slideCount),
  ]
}

/** Full rule set for the GENERATION prompt — the writer needs the mechanical bounds too. */
export function carouselStructureRules(slideCount: number): string[] {
  return [
    ...carouselRoleRules(slideCount, CAROUSEL_COVER_RULE),
    ...CAROUSEL_SEMANTIC_COMMON,
    ...CAROUSEL_MECHANICAL_COMMON,
  ]
}

/** Judgment-only rule set for the VALIDATION prompt — mechanical rules are checked in code. */
export function carouselSemanticRules(slideCount: number): string[] {
  return [...carouselRoleRules(slideCount, CAROUSEL_COVER_RULE_SEMANTIC), ...CAROUSEL_SEMANTIC_COMMON]
}



// ---- Issue type definitions (objective, grounded in structure rules) ----

export const ISSUE_TYPE_DEFINITIONS: Record<string, string> = {
  weak_hook:
    'First sentence contains no niche-specific noun, named person, concrete number, or sensory detail; could open any post in this industry',
  generic_cta:
    'CTA contains no action verb tied to a specific service, outcome, or destination unique to this client',
  no_personality:
    'Zero brand-specific vocabulary, named client/product references, or tone markers from the declared tone',
  too_polished:
    'Three or more consecutive sentences in the 8-25 word range with no sentence shorter than 6 words or longer than 35 words',
  buried_lead:
    'The most interesting point is hidden after filler opening lines',
  filler_content:
    'Sentence restates the preceding sentence or contains only transitional connectors with no new fact or insight',
  repetitive:
    'Same idea or phrasing repeated in different words',
  off_brand:
    'Post uses vocabulary, register, or framing explicitly excluded by the declared tone',
  wrong_audience:
    'Post addresses pain points, aspirations, or vocabulary belonging to a different audience segment than declared',
}

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

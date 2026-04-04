export interface PlatformLimits {
  readonly wordCount: { readonly min: number; readonly max: number }
  readonly hashtags: { readonly max: number; readonly rule: string }
}

// Structure descriptions — single source of truth for both generator and evaluator.
const STRUCTURE_DESCRIPTIONS: Record<string, string> = {
  'STORY-FIRST': `STORY-FIRST: Start with a specific moment or scene — something observed, a pattern noticed, a before/after. Let the reader draw their own conclusion. Close with a question or soft invitation.`,
  'MYTH-BREAKER': `MYTH-BREAKER: Name a common belief that most people hold. Explain why it is wrong using one specific, concrete detail. Leave the reader with a new mental model. No CTA needed.`,
  'CLIENT-WORLD SNAPSHOT': `CLIENT-WORLD SNAPSHOT: Describe something only this business's clients experience — a feeling, a moment, a small detail others would miss. Connect it to why it matters.`,
  'OBSERVATION': `OBSERVATION: Share a specific pattern noticed about clients, the work, or the field. Add one sentence of insight. Close connecting the observation to what the reader can do or notice.`,
  'CONFESSION': `CONFESSION: Admit something surprising or counterintuitive about the business or the work. Connect it to why it matters to the reader. No CTA needed.`,
  'SINGLE VIVID IMAGE': `SINGLE VIVID IMAGE: Open with one striking image, detail, or sensory observation. Build 2-3 sentences of context. Close with a reflection or question that ties it to the reader's experience.`,
} as const

export const ALL_POST_STRUCTURES: readonly string[] = Object.keys(STRUCTURE_DESCRIPTIONS)

export const CTA_EXEMPT_STRUCTURES: readonly string[] = [
  'MYTH-BREAKER', 'CONFESSION',
] as const

// ---- Sentence Variety ----
export const MIN_SHORT_SENTENCE_WORDS = 6
export const MIN_LONG_SENTENCE_WORDS = 20
export const MAX_CONSECUTIVE_SIMILAR_LENGTH = 2

// ---- Platform Limits ----
export const PLATFORM_LIMITS: Record<string, PlatformLimits> = {
  'Instagram': { wordCount: { min: 150, max: 220 }, hashtags: { max: 3, rule: 'niche/location specific at end' } },
  'Facebook': { wordCount: { min: 150, max: 300 }, hashtags: { max: 2, rule: 'only if tied to event, default none' } },
  'LinkedIn': { wordCount: { min: 200, max: 350 }, hashtags: { max: 5, rule: 'professional niche hashtags' } },
  'X / Twitter': { wordCount: { min: 1, max: 50 }, hashtags: { max: 2, rule: 'for trending topics only' } },
  'TikTok': { wordCount: { min: 50, max: 150 }, hashtags: { max: 5, rule: 'niche/trending hashtags' } },
} as const

// ---- Functions ----

export function formatStructureDescriptions(): string {
  return ALL_POST_STRUCTURES
    .map((s, i) => `${i + 1}. ${STRUCTURE_DESCRIPTIONS[s] ?? s}`)
    .join('\n\n')
}

export function formatStructures(): string {
  return ALL_POST_STRUCTURES.join(', ')
}

export function formatWordCount(platform: string): string {
  const limits = PLATFORM_LIMITS[platform]
  if (!limits) return 'Follow platform conventions'
  return `${limits.wordCount.min}-${limits.wordCount.max} words`
}

export function formatHashtagRules(platform: string): string {
  const limits = PLATFORM_LIMITS[platform]
  if (!limits) return 'Follow platform conventions'
  return `Max ${limits.hashtags.max} hashtags — ${limits.hashtags.rule}`
}

// ---- AI Tell Patterns (per language) ----
// Each language has its own set of AI tell patterns — structural signals that
// betray machine-generated text. Single source for both generation and validation.

export const EN_SPECIFIC_AI_TELLS: readonly string[] = [
  'Syntactic Monotony: 3+ sentences in a row with similar word counts (missing "punchy" vs "detailed" contrast).',
  'Adjective Stacking: Using 3+ descriptors for a single noun (e.g., "innovative, powerful, expert care").',
  'Corporate Prefacing: Using unearned authority triggers like "At [Company Name], we..." or "As experts...".',
  'Low Information Density: Intro sentences that contain zero niche-specific nouns or data points.',
  'Academic Transitions: Using "Furthermore," "Moreover," or "Additionally" to link social media ideas.',
  'Passive Translation: Over-reliance on "is/are/was" and "of/for" structures instead of active, idiomatic verbs.',
] as const

export const BG_SPECIFIC_AI_TELLS: readonly string[] = [
  'Passive Voice Overload: Frequent use of "беше [причастие]" (direct translation of English passive).',
  'Filler Goal Phrasing: Using "има за цел да" or "цели да" instead of active verbs.',
  'Noun Chains: 3+ nouns linked by "на" (e.g., "анализ на процеса на работа на...").',
  'Conditional Politeness: Excessive use of "Бихме желали/искали" which creates a robotic "template" feel.',
  'Shortened Form Avoidance: AI never uses natural Bulgarian shortened verbs or particles (e.g., "ще се справя" vs the AI\'s "ще успея да се справя").',
  'Cliché Superlatives: Use of empty words like "уникален", "ексклузивен", or "невероятен" without factual backing.',
] as const

const AI_TELLS_BY_LANGUAGE: Record<string, readonly string[]> = {
  English: EN_SPECIFIC_AI_TELLS,
  Bulgarian: BG_SPECIFIC_AI_TELLS,
}

/** Returns AI tell patterns for a given language. Falls back to English. */
export function getAiTellsForLanguage(language: string): readonly string[] {
  return AI_TELLS_BY_LANGUAGE[language] ?? EN_SPECIFIC_AI_TELLS
}

/** Formats AI tell patterns for prompt injection — single function for all consumers. */
export function formatAiTells(language: string): string {
  return getAiTellsForLanguage(language).map(p => `- ${p}`).join('\n')
}

export function formatHealthRules(): string {
  return [
    'Educational content only',
    'No promised outcomes or medical claims',
    'No specific dosages or treatment protocols',
    'Always recommend consulting a professional',
  ].join('. ') + '.'
}

export interface PlatformLimits {
  readonly wordCount: { readonly min: number; readonly max: number }
  readonly hashtags: { readonly max: number; readonly rule: string }
}

// Structure descriptions for generation — keys must match STRUCTURE_CHECKLISTS in criteria.ts.
const STRUCTURE_DESCRIPTIONS: Record<string, string> = {
  'THE COUNTER-INTUITIVE TRUTH': `THE COUNTER-INTUITIVE TRUTH: Identify a common belief in the field that is actually a mistake. (e.g., 'Most people think [X], but the data shows [Y]'). If the source provides a number or technical fact, use it to prove the point. Otherwise reference a well-known industry pattern. Close by explaining the benefit of this 'new' way of thinking.`,
  'SENSORY SNAPSHOT': `SENSORY SNAPSHOT: Focus entirely on one physical or visual detail typical in this type of work. (e.g., The light in a renovated kitchen, the texture of a product, what a workspace looks like mid-process). Describe it with precision. Connect this small detail to the high quality of the overall result.`,
  'PROFESSIONAL PERSPECTIVE': `PROFESSIONAL PERSPECTIVE: Present a pattern commonly observed in this field after working with many cases or clients. (e.g., 'The biggest mistake people make in their first week of [X] is...'). Offer one deep, expert solution. The tone should be 'Expert Peer'—knowledgeable but not preaching.`,
  'THE TRANSPARENT PROCESS': `THE TRANSPARENT PROCESS: Pull back the curtain on one specific part of the job that people don't usually see. (e.g., How a professional chooses a specific material, how a room is prepped, or why a certain step takes the time it does). Explain why this 'hidden' effort is what actually creates the value.`,
  'THE CONTRAST': `THE CONTRAST: Directly compare two states without using hype words. Use details from source material when available; otherwise use realistic scenarios without inventing exact numbers. (e.g., 'Before [X], the situation was [Detail A]. After [Y], it was [Detail B]'). Use technical or factual descriptions only. Let the evidence speak for itself. No 'Amazing results' or 'Life-changing' adjectives.`,
} as const

export const ALL_POST_STRUCTURES: readonly string[] = Object.keys(STRUCTURE_DESCRIPTIONS)

// ---- Sentence Variety ----
export const MIN_SHORT_SENTENCE_WORDS = 6
export const MIN_LONG_SENTENCE_WORDS = 20
export const MAX_CONSECUTIVE_SIMILAR_LENGTH = 2

// ---- Platform Limits ----
export const PLATFORM_LIMITS: Record<string, PlatformLimits> = {
  Instagram: {
    wordCount: { min: 150, max: 220 },
    hashtags: { max: 3, rule: 'niche/location specific at end' },
  },
  Facebook: {
    wordCount: { min: 150, max: 300 },
    hashtags: { max: 2, rule: 'only if tied to event, default none' },
  },
  LinkedIn: {
    wordCount: { min: 200, max: 350 },
    hashtags: { max: 5, rule: 'professional niche hashtags' },
  },
  'X / Twitter': {
    wordCount: { min: 1, max: 50 },
    hashtags: { max: 2, rule: 'for trending topics only' },
  },
  TikTok: {
    wordCount: { min: 50, max: 150 },
    hashtags: { max: 5, rule: 'niche/trending hashtags' },
  },
} as const

// ---- Functions ----

export function formatStructureDescriptions(): string {
  return ALL_POST_STRUCTURES.map((s, i) => `${i + 1}. ${STRUCTURE_DESCRIPTIONS[s] ?? s}`).join(
    '\n\n'
  )
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
  'Impersonal Passive Instructions: "Препоръчва се да", "Съветва се да", "Необходимо е да" instead of direct second-person address like "Провери", "Помисли", "Знай".',
  'Bureaucratic Compound Nouns: Formal compound phrases like "семеен състав", "жилищна площ", "потребителски профил" where a native speaker would use simple, conversational words.',
  'Mechanical Parallel Questions: Firing 2-3 Вие-form questions back-to-back with identical structure ("Очаквате ли X? Планирате ли Y?") — sounds like a bureaucratic form, not a human speaking.',
  'English Marketing Calques: Translating abstract English marketing phrases literally instead of using native Bulgarian expressions (e.g., "надхвърля стандартната презентация" for "goes beyond the standard presentation").',
  'Character Confusion: Replacing or dropping "ъ" (er golam, U+044A) — a letter unique to Bulgarian. Never substitute it with "ь" (soft sign) or omit it. Correct spellings: "съобщение", "съседен", "също", "към", "бъдеще", "събитие", "Съседни".',
] as const

const AI_TELLS_BY_LANGUAGE: Record<string, readonly string[]> = {
  english: EN_SPECIFIC_AI_TELLS,
  bulgarian: BG_SPECIFIC_AI_TELLS,
}

/** Returns AI tell patterns for a given language. Falls back to English. */
export function getAiTellsForLanguage(language: string): readonly string[] {
  return AI_TELLS_BY_LANGUAGE[language.toLowerCase()] ?? EN_SPECIFIC_AI_TELLS
}

/** Formats AI tell patterns for prompt injection — single function for all consumers. */
export function formatAiTells(language: string): string {
  return getAiTellsForLanguage(language)
    .map((p) => `- ${p}`)
    .join('\n')
}

export function formatHealthRules(): string {
  return (
    [
      'Educational content only',
      'No promised outcomes or medical claims',
      'No specific dosages or treatment protocols',
      'Always recommend consulting a professional',
    ].join('. ') + '.'
  )
}

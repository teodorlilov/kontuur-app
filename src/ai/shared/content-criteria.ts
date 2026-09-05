/**
 * One caption length, for every network a post can reach.
 *
 * This was a per-platform table — Instagram 150-220, Facebook 150-300, LinkedIn 200-350 —
 * read from the platform a post was WRITTEN FOR. Generation no longer chooses a network:
 * copy is written once and the destination is picked when the post is scheduled, so the
 * question "how long should this be" has to be answered before anyone knows where it goes.
 *
 * The answer is the tightest bound of the networks it could reach. Instagram's 220 words is
 * inside Facebook's 300, so copy written to this fits either — whereas anything written to
 * the looser bound would have to be cut to publish. Writing short and travelling everywhere
 * beats writing long and being rejected.
 */
const CAPTION_WORD_COUNT = { min: 150, max: 220 } as const

// ---- Sentence Variety ----

// ---- Functions ----

export function formatWordCount(): string {
  return `${CAPTION_WORD_COUNT.min}-${CAPTION_WORD_COUNT.max} words`
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

// ---- AI Tell Patterns (per language) ----

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

/** Formats AI tell patterns for prompt injection. */
export function formatAiTells(language: string): string {
  return getAiTellsForLanguage(language)
    .map((p) => `- ${p}`)
    .join('\n')
}

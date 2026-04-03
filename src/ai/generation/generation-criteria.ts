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

export function formatHealthRules(): string {
  return [
    'Educational content only',
    'No promised outcomes or medical claims',
    'No specific dosages or treatment protocols',
    'Always recommend consulting a professional',
  ].join('. ') + '.'
}

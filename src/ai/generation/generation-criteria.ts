import type { LanguageConfig } from '@/lib/clients/language-rules'

// ---- Opener Rules ----

/** Banned opener types — hardcoded because these are universal anti-patterns, not language-specific. */
export const BANNED_OPENER_TYPES: readonly { id: string; description: string }[] = [
  { id: 'general_truth', description: 'A general truth about the topic' },
  { id: 'if_generic', description: '"If" followed by a generic condition' },
  { id: 'business_name', description: 'The business name or "We"' },
  { id: 'seasonal', description: 'A seasonal observation ("Spring is here", "It is that time of year")' },
  { id: 'did_you_know', description: 'A question starting with "Did you know"' },
] as const

// ---- Post Structures ----
export const ALL_POST_STRUCTURES: readonly string[] = [
  'STORY-FIRST', 'MYTH-BREAKER', 'CLIENT-WORLD SNAPSHOT',
  'OBSERVATION', 'CONFESSION', 'SINGLE VIVID IMAGE',
] as const

export const CTA_EXEMPT_STRUCTURES: readonly string[] = [
  'MYTH-BREAKER', 'CONFESSION',
] as const

// Formal: exclude CONFESSION (too personal) and STORY-FIRST (casual anecdote)
// Casual and neutral: all six structures available
export const POST_STRUCTURES_BY_FORMALITY: Record<string, readonly string[]> = {
  formal: ['MYTH-BREAKER', 'CLIENT-WORLD SNAPSHOT', 'OBSERVATION', 'SINGLE VIVID IMAGE'],
  casual: ALL_POST_STRUCTURES,
  neutral: ALL_POST_STRUCTURES,
} as const

export function getAllowedStructures(formality: string): readonly string[] {
  return POST_STRUCTURES_BY_FORMALITY[formality] ?? ALL_POST_STRUCTURES
}

// ---- Structure Descriptions ----
// Moved here from prompt-sections.ts — single source of truth for both generator and evaluator.
// Cross-ref: openers by formality (above), evaluation criteria (evaluation-criteria.ts),
export const STRUCTURE_DESCRIPTIONS: Record<string, string> = {
  'STORY-FIRST': `STORY-FIRST: Start with a specific moment or scene from the client's world — something observed, a pattern noticed, a before/after. Let the reader draw their own conclusion. Close with a question or soft invitation — no hard sell.
   FORMAL: Frame as a professional observation or third-person account, not a personal anecdote. CASUAL: First-person encouraged.`,
  'MYTH-BREAKER': `MYTH-BREAKER: Name a common belief in the niche that most people hold. Explain why it is wrong using one specific, concrete detail — a number, a case, an observation. Leave the reader with a new mental model. No CTA needed.
   Works at any register.`,
  'CLIENT-WORLD SNAPSHOT': `CLIENT-WORLD SNAPSHOT: Describe something only this business's clients experience — a feeling, a moment, a small detail others would miss. Connect it to why it matters. End with a soft prompt or leave it open.
   Works at any register.`,
  'OBSERVATION': `OBSERVATION: Share a specific pattern noticed about clients, about the work, about the field. Add one sentence of insight. Close with one sentence connecting the observation to what the reader can do or notice.
   Works at any register.`,
  'CONFESSION': `CONFESSION: Admit something surprising or counterintuitive about the business or the work — something you used to believe, a mistake, an unpopular opinion. Connect it to why it matters to the reader. No CTA at all.
   FORMAL: Frame as a professional insight or industry reflection. CASUAL: Personal vulnerability encouraged.`,
  'SINGLE VIVID IMAGE': `SINGLE VIVID IMAGE: Open with one striking image, detail, or sensory observation. Build 2-3 sentences of context. Close with a reflection or question that ties the image back to the reader's experience.
   Works at any register.`,
} as const

export function formatStructureDescriptions(formality?: string): string {
  const allowed = getAllowedStructures(formality ?? 'neutral')
  return allowed
    .map((s, i) => `${i + 1}. ${STRUCTURE_DESCRIPTIONS[s] ?? s}`)
    .join('\n\n')
}

// ---- Sentence Variety ----
export const MIN_SHORT_SENTENCE_WORDS = 6
export const MIN_LONG_SENTENCE_WORDS = 20
export const MAX_CONSECUTIVE_SIMILAR_LENGTH = 2

// ---- Word Count by Platform ----
export interface PlatformWordCount {
  readonly min: number
  readonly max: number
}

export const PLATFORM_WORD_COUNTS: Record<string, PlatformWordCount> = {
  'Instagram': { min: 150, max: 220 },
  'Facebook': { min: 150, max: 300 },
  'LinkedIn': { min: 200, max: 350 },
  'X / Twitter': { min: 1, max: 50 },
  'TikTok': { min: 50, max: 150 },
} as const

// ---- Hashtag Limits by Platform ----
export interface PlatformHashtagLimit {
  readonly max: number
  readonly rule: string
}

export const PLATFORM_HASHTAG_LIMITS: Record<string, PlatformHashtagLimit> = {
  'Instagram': { max: 3, rule: 'niche/location specific at end' },
  'Facebook': { max: 2, rule: 'only if tied to event, default none' },
  'LinkedIn': { max: 5, rule: 'professional niche hashtags' },
  'X / Twitter': { max: 2, rule: 'for trending topics only' },
  'TikTok': { max: 5, rule: 'niche/trending hashtags' },
} as const

// ---- Health Client Rules ----
export const HEALTH_CLIENT_RULES: readonly string[] = [
  'Educational content only',
  'No promised outcomes or medical claims',
  'No specific dosages or treatment protocols',
  'Always recommend consulting a professional',
] as const

// ---- Format helpers for generation prompts ----

export function formatAllowedOpeners(config?: LanguageConfig | null): string {
  const formality = config?.formality ?? 'neutral'
  const openers = config?.openerExamples?.filter((e) => e.formality === formality) ?? []
  if (openers.length === 0) return '   (no opener types defined for this register)'
  return openers
    .map((e, i) => {
      let line = `   (${String.fromCharCode(97 + i)}) ${e.description}`
      line += `\n      Example: ${e.content}`
      return line
    })
    .join('\n')
}

export function formatBannedOpeners(): string {
  return BANNED_OPENER_TYPES.map((r) => `   - ${r.description}`).join('\n')
}

export function formatStructures(formality?: string): string {
  const structures = formality ? getAllowedStructures(formality) : ALL_POST_STRUCTURES
  return structures.join(', ')
}

export function formatWordCount(platform: string): string {
  const wc = PLATFORM_WORD_COUNTS[platform]
  if (!wc) return 'Follow platform conventions'
  return `${wc.min}-${wc.max} words`
}

export function formatHashtagRules(platform: string): string {
  const hl = PLATFORM_HASHTAG_LIMITS[platform]
  if (!hl) return 'Follow platform conventions'
  return `Max ${hl.max} hashtags — ${hl.rule}`
}

export function formatHealthRules(): string {
  return HEALTH_CLIENT_RULES.join('. ') + '.'
}
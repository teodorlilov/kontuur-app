// ---- Opener Rules ----
export interface OpenerRule {
  readonly id: string
  readonly description: string
}

// All formality modes defined explicitly — no external references between modes.
// Formal: 4 types — no mid-thought (too casual, breaks professional distance)
// Casual: 6 types — all options available (includes mid-thought)
// Neutral: 5 types — no mid-thought (too informal for neutral register)
// Cross-ref: evaluation criteria (evaluation-criteria.ts FORMALITY_EVALUATION_CRITERIA),
// register rules (prompt-sections.ts FORMALITY_GUIDANCE).
export const ALLOWED_OPENER_TYPES_BY_FORMALITY: Record<string, readonly OpenerRule[]> = {
  formal: [
    {
      id: 'professional_observation',
      description: 'Open with a specific observation from clinical or professional practice — something the expert notices that clients often miss. Framed as knowledge, not intimacy. Example cue: "Patients who [specific behaviour] consistently show [specific outcome]." NOT: "Many people struggle with X" (too generic).',
    },
    {
      id: 'counterintuitive_professional',
      description: 'State a professional insight that contradicts a common assumption in the niche. Must be specific to this field — not a generic "surprising fact". Example cue: "The most common reason [treatment] fails is not [what clients assume] — it is [actual clinical reason]." Must contain a concrete niche-specific claim.',
    },
    {
      id: 'specific_question_expert',
      description: 'Ask a precise diagnostic question that a professional would ask — one that names a specific situation the target audience is already in. NOT "Have you ever thought about X?" (too broad). YES "When was the last time you [very specific action relevant to niche]?" The question must make the reader stop and think about their own situation.',
    },
    {
      id: 'reframe',
      description: 'Take a concept the audience thinks they understand and reframe it from a professional perspective in one sentence. The reframe must be genuinely surprising — not just rewording. Example cue: "What most people call [common term] is actually [more precise professional description]." Sets up expert credibility without claiming authority.',
    },
  ],
  casual: [
    {
      id: 'specific_feeling_now',
      description: 'Name a very specific feeling or physical sensation the reader is likely experiencing RIGHT NOW or regularly. Not an emotion category ("anxiety") — a specific moment ("that feeling when you catch yourself [very specific behaviour]"). Must be so precise the reader thinks "how did they know?" NOT: "We all feel stressed sometimes."',
    },
    {
      id: 'counterintuitive_claim',
      description: 'Open with a claim that directly contradicts what the reader probably believes — stated with confidence, no hedging. Must be specific to the niche, not a generic "surprising" opener. The claim should make the reader want to disagree AND keep reading. NOT: "You might be surprised to learn..." YES: "[Confident specific claim that challenges assumption]."',
    },
    {
      id: 'mid_thought',
      description: 'Drop the reader into the middle of a thought or scene as if they missed the beginning — creates instant curiosity about what came before. Works like starting a story at chapter 3. Example cue: "...and that is exactly why [specific consequence]." or "Three [time units] in, and [specific observation]." Reader must feel they are catching up, not being introduced.',
    },
    {
      id: 'specific_question',
      description: 'Ask about a very specific experience the audience has definitely had — not a general topic question. The question must name a situation so precisely that anyone who has been through it feels seen. NOT: "Do you struggle with X?" YES: "When did you last [very specific action] and immediately regret [very specific outcome]?"',
    },
    {
      id: 'uncomfortable_truth',
      description: 'Name something true about the niche or the audience\'s situation that people know but rarely say out loud. Not a criticism — an observation that feels honest and slightly brave to say. Example cue: "Nobody talks about [specific thing that happens] but it happens to almost everyone who [relevant situation]." Must feel like relief to read, not a lecture.',
    },
    {
      id: 'specific_detail',
      description: 'Open with one hyper-specific concrete detail — a number, a moment, a sensory observation — that implies a larger story without stating it. The detail should create a question in the reader\'s mind. Example cue: "After [specific number] [units of time], the [specific thing] had [specific unexpected state]." The detail must be so specific it could only come from direct experience.',
    },
  ],
  neutral: [
    {
      id: 'specific_observation',
      description: 'Open with a precise observation from the niche — something specific enough that only someone with real experience in this field would say it. Framed informatively, not dramatically. Must contain a concrete detail (number, named phenomenon, specific situation) that grounds the observation. NOT: "Many people experience difficulty with X." YES: "[Specific concrete observation with real detail]."',
    },
    {
      id: 'counterintuitive_claim',
      description: 'State a claim that contradicts a common assumption — delivered with confidence but without aggression. Specific to the niche, not a generic hook. Must make the reader want to understand why, not just be surprised. Avoid rhetorical questions ("Did you know?") — state the claim directly. The counterintuitive element must be genuinely non-obvious.',
    },
    {
      id: 'specific_question',
      description: 'Ask a precise question about a specific situation the audience is in or has been in. The question must be concrete enough that the reader can answer yes or no based on a real experience — not a hypothetical. NOT: "Are you looking to improve your [general thing]?" YES: "When you [very specific action], do you notice [very specific consequence]?"',
    },
    {
      id: 'specific_detail',
      description: 'Open with one concrete, specific detail — a precise number, a named moment, a specific object or outcome — that creates immediate curiosity about the context. The detail should feel like evidence of something larger without explaining what. Works like a news headline that makes you click. Must be grounded in the niche world, not invented for effect.',
    },
    {
      id: 'reframe',
      description: 'Take a concept the audience already has an opinion on and present it from a different angle in one sentence — without telling them their current view is wrong. The reframe reveals something they had not considered. Example cue: "What looks like [common interpretation] is often actually [more accurate interpretation]." Should feel like a useful lens, not a correction.',
    },
  ],
} as const

export function getAllowedOpenerTypes(formality: string): readonly OpenerRule[] {
  // Falls back to neutral if formality is unrecognised
  return ALLOWED_OPENER_TYPES_BY_FORMALITY[formality] ?? ALLOWED_OPENER_TYPES_BY_FORMALITY['neutral']!
}

export const BANNED_OPENER_TYPES: readonly OpenerRule[] = [
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
// register rules (prompt-sections.ts FORMALITY_GUIDANCE).
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

// ---- Banned Phrases ----
export const BANNED_PHRASES: readonly string[] = [
  'Discover', 'Unlock', 'Transform', 'Elevate', 'Journey',
  'We are proud to', 'We are excited to', "In today's world",
  'Did you know?', 'Book now and', 'The power of',
] as const

// ---- Banned Phrases by Language ----
// detectBannedPhrases() in text-analysis.ts should use getBannedPhrasesForLanguage()
// so Bulgarian posts using "Открийте" are caught, not just English "Discover".
export const BANNED_PHRASES_BY_LANGUAGE: Record<string, readonly string[]> = {
  English: BANNED_PHRASES,
  Bulgarian: [
    'Открийте', 'Отключете', 'Трансформирайте', 'Издигнете', 'Пътуване',
    'Горди сме да', 'Развълнувани сме да', 'В днешния свят',
    'Знаехте ли?', 'Резервирайте сега и', 'Силата на',
  ],
}

/** Returns the banned phrases for a given language, falling back to English. */
export function getBannedPhrasesForLanguage(language: string): readonly string[] {
  return BANNED_PHRASES_BY_LANGUAGE[language] ?? BANNED_PHRASES
}

// ---- Health Client Rules ----
export const HEALTH_CLIENT_RULES: readonly string[] = [
  'Educational content only',
  'No promised outcomes or medical claims',
  'No specific dosages or treatment protocols',
  'Always recommend consulting a professional',
] as const

// ---- Format helpers for generation prompts ----

export function formatAllowedOpeners(formality?: string): string {
  const types = formality
    ? getAllowedOpenerTypes(formality)
    : ALLOWED_OPENER_TYPES_BY_FORMALITY['neutral']!
  return types
    .map((r, i) => `   (${String.fromCharCode(97 + i)}) ${r.description}`)
    .join('\n')
}

export function formatBannedOpeners(): string {
  return BANNED_OPENER_TYPES.map((r) => `   - ${r.description}`).join('\n')
}

export function formatBannedPhrases(): string {
  return BANNED_PHRASES.join(' · ')
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
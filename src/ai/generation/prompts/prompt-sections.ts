/**
 * Shared prompt section builders for AI prompts.
 * Follows the source-grounding.ts pattern: pure functions returning prompt strings.
 * Used by generate-post, generate-carousel, generate-reels, and rewrite prompts.
 */

import {
  formatBannedPhrases,
  formatBannedOpeners,
  formatAllowedOpeners,
  formatWordCount,
  formatHashtagRules,
  formatHealthRules,
  formatStructureDescriptions,
} from '@/ai/generation/generation-criteria'
import { formatAiTellPatterns } from '@/ai/validation/content-rules/validation-criteria'
import type { WeightedPillar } from '@/lib/clients/content-pillars'
import { getFormalityGuidance } from './formality-guidance'
import type { WritingContext } from '../writing-context'

export type { WritingContext }

export function buildBrandVoiceSection(ctx: WritingContext): string {
  let section = `BRAND VOICE:
This brand sounds: ${ctx.tone}.`

  if (ctx.clientTestimonialVoice) {
    section += `\nClients describe it as: '${ctx.clientTestimonialVoice}'.`
  }

  section += `\nMatch this emotional quality within the register above.
The EMOTION can be warm even when the REGISTER is formal.
If the post could be written about any business, it has failed this test.`

  return section
}

// ---------------------------------------------------------------------------
// Static system prompt — identical for ALL clients, globally cacheable
// ---------------------------------------------------------------------------

let _cachedStaticPrompt: string | null = null

/**
 * Returns a static system prompt with zero parameters.
 * Contains no client-specific data — all client references point to "the client brief"
 * (i.e. the user message assembled by buildClientProfile).
 * Use with cache_control: { type: 'ephemeral' } for cross-client caching.
 * Cached at module level — string concatenation runs once, not per-theme.
 */
export function buildStaticSystemPrompt(): string {
  if (_cachedStaticPrompt) return _cachedStaticPrompt
  _cachedStaticPrompt = `You are a senior social media copywriter. You write for humans, not algorithms.

POST STRUCTURE — pick ONE from the ALLOWED STRUCTURES in the client brief.
NEVER use 'problem → solution → CTA'. The reader should NOT predict the structure after the first line.

OPENER — the most important line. Must be one of the ALLOWED OPENERS in the client brief.
NEVER start with:
${formatBannedOpeners()}
NEVER bury the lead — start with the payoff, not the context.

WRITING RULES:
1. Mix short and long sentences. At least one under 6 words and one over 20.
   Never three consecutive sentences of similar length.
2. BANNED phrases (never use in any language):
   ${formatBannedPhrases()}
3. One CTA maximum. Specific and low-pressure.
   Exception: MYTH-BREAKER and CONFESSION structures may omit the CTA entirely.
4. Follow hashtag and word count limits from the client brief.
5. The language register rules are in the client brief. Follow them exactly — they are non-negotiable.
6. Every claim must be grounded in what this specific business does — not abstract promises.

AI-generated text does these things — never do them:
${formatAiTellPatterns()}

SELF-CHECK (before returning your response):
- Does the opener make someone stop scrolling, or does it confirm what they already know? If the latter — rewrite the opener.
- If source material was provided: every specific detail MUST come from that source. Pick ONE angle — do not summarize the whole source.
- If no source: include at least one detail that only this specific business could produce.
- Can the reader predict the post's structure after the first line? If yes — restructure.`
  return _cachedStaticPrompt
}

// ---------------------------------------------------------------------------
// Client profile — all client-specific context for the user message
// ---------------------------------------------------------------------------

export interface ClientProfileInput {
  ctx: WritingContext
  platform: string
  clientName: string
  contentPillars: WeightedPillar[]
  targetPillar?: string
  avoidTopics: string
  isHealthClient?: boolean
}

/**
 * Assembles all client-specific context for the user message.
 * Replaces the old buildAuthenticWritingSection, buildBrandVoiceSection (in system),
 * buildPostStructureAlternatives, and inline platform/health rules.
 */
export function buildClientProfile(input: ClientProfileInput): string {
  const { ctx } = input
  const sections: string[] = []

  // 1. ALLOWED OPENERS — model reads these before committing
  sections.push(`ALLOWED OPENERS for ${ctx.formality} register:
${formatAllowedOpeners(ctx.formality)}`)

  // 2. ALLOWED STRUCTURES — model reads these before committing
  sections.push(`ALLOWED STRUCTURES for ${ctx.formality} register:
${formatStructureDescriptions(ctx.formality)}

CRITICAL: The reader must NOT predict the structure after the first line.
Pick the structure that creates the most unexpected opening for this theme.`)

  // 3. CLIENT BRIEF
  sections.push(`CLIENT PROFILE:
Client: ${input.clientName} | Niche: ${ctx.niche} | Platform: ${input.platform}
Language: ${ctx.language} | Formality: ${ctx.formality}
Target audience: ${ctx.targetAudience}
Content pillars: ${input.contentPillars.map((p) => `${p.pillar} (${p.weight}%)`).join(', ')}${input.targetPillar ? `\nThis post targets pillar: ${input.targetPillar}` : ''}
Topics to avoid: ${input.avoidTopics}

SPECIFICITY REQUIREMENT:
The post must contain at least one detail that could only come from ${input.clientName} — not any similar business in the same field.
Generic niche observations any competitor could post will score poorly.`)

  // 4. REGISTER RULES (language + formality — appears once, here)
  sections.push(buildLanguageRulesSection({
    language: ctx.language,
    formality: ctx.formality,
    bannedAnglicisms: ctx.bannedAnglicisms,
    bannedCalques: ctx.bannedCalques,
    nativeCTAPhrases: ctx.nativeCTAPhrases,
  }))

  // 5. BRAND VOICE
  sections.push(buildBrandVoiceSection(ctx))

  // 6. PLATFORM LIMITS
  sections.push(`PLATFORM LIMITS:
Word count: ${formatWordCount(input.platform)} | Hashtags: ${formatHashtagRules(input.platform)}`)

  // 7. HEALTH RULES — conditional, never shown for non-health clients
  if (input.isHealthClient) {
    sections.push(`HEALTH CONTENT RULES (NON-NEGOTIABLE — override other instructions when they conflict):
${formatHealthRules()}
If unsure whether a detail is a medical claim or dosage — omit it.
When using source material: the source may contain medical claims. Filter them out — do not reproduce them because they appear in the source.`)
  }

  return sections.join('\n\n')
}

/**
 * Builds the universal banned phrases section.
 */
export function buildBannedPhrasesSection(): string {
  return `BANNED phrases (never use in any language):
${formatBannedPhrases()}`
}

// ---------------------------------------------------------------------------
// Language rules (generation) — register + banned terms for generation prompts
// ---------------------------------------------------------------------------

export interface LanguageRulesContext {
  language: string
  formality: string
  bannedAnglicisms: string[]
  bannedCalques: string[]
  nativeCTAPhrases?: string
}

/**
 * Builds the language rules section for generation / rewrite prompts.
 * Content is driven by `ctx.language` from the client profile so each
 * language gets tailored anti-translation framing and examples.
 */
export function buildLanguageRulesSection(ctx: LanguageRulesContext): string {
  const fg = getFormalityGuidance(ctx.formality)

  const bannedAnglicismsLine = ctx.bannedAnglicisms.length
    ? `BANNED anglicisms (never use): ${ctx.bannedAnglicisms.join(', ')}`
    : ''
  const bannedCalquesLine = ctx.bannedCalques.length
    ? `BANNED calques (never use): ${ctx.bannedCalques.join(', ')}`
    : ''
  const ctaLine = ctx.nativeCTAPhrases
    ? `Use only these approved CTAs: ${ctx.nativeCTAPhrases}`
    : ''

  // Register rules are emitted here (once) — removed duplicate formalityBlock that also
  // appeared in the retired buildAuthenticWritingSection.
  const registerBlock = `LANGUAGE REGISTER (${ctx.formality.toUpperCase()}):
${fg.registerRules}`

  const sharedLines = [registerBlock, bannedAnglicismsLine, bannedCalquesLine, ctaLine]
    .filter(Boolean)
    .join('\n')

  if (ctx.language === 'Bulgarian') {
    const bulgarianFormalityExamples = fg.bulgarianExamples ? `\n${fg.bulgarianExamples}\n` : ''

    return `LANGUAGE RULES — BULGARIAN:
You are a native Bulgarian copywriter. Think in Bulgarian from the start.
Do NOT compose in English and translate — every phrase, idiom, and sentence structure must originate in Bulgarian.
If you catch yourself translating an English expression, stop and ask: how would a Bulgarian SMM manager in Sofia actually say this?

EXAMPLES OF BAD vs GOOD BULGARIAN (learn from these):
BAD: "Вашият следващ дом може да е на една разговор разстояние."
WHY BAD: "на една разговор разстояние" is a broken calque of "one conversation away" — no Bulgarian would say this. Also wrong gender: "една" is feminine but "разговор" is masculine.
GOOD: "Само един разговор ви дели от новия ви дом."

BAD: "Питат за kvadratура"
WHY BAD: "kvadrat" is Latin script mixed with Cyrillic "ура" — every character must be Cyrillic.
GOOD: "Питат за квадратура"

BAD: "Искате ли Вашият брокер да следи пазара вместо Вие?"
WHY BAD: "вместо Вие" uses nominative case after a preposition — must be "вместо Вас". Prepositions require non-nominative pronouns.
GOOD: "Искате ли Вашият брокер да следи пазара вместо Вас?"

BAD: "Ние сме развълнувани да споделим нашата нова услуга!"
WHY BAD: Direct calque of "We are excited to share our new service!" — no Bulgarian business writes this way.
GOOD: "Имаме нещо ново за вас." (or rephrase entirely in natural Bulgarian)

BAD: "В днешния забързан свят, грижата за кожата е от изключително значение."
WHY BAD: "В днешния забързан свят" is a calque opener. "от изключително значение" is bookish filler.
GOOD: Start with a specific observation, not a generic truth about "today's world."
${bulgarianFormalityExamples}
NATURALNESS TEST:
After writing, read each sentence and ask: would a Bulgarian person actually post this on Instagram?
If it sounds like it was translated from English — even if grammatically defensible — rewrite it from scratch in Bulgarian. Do not patch a translation.

${sharedLines}`
  }

  const generalFormalityExamples = fg.generalExamples ? `\n${fg.generalExamples}\n` : ''

  // Default for all other languages
  return `LANGUAGE RULES:
Write as a native ${ctx.language} speaker. Think in ${ctx.language}, not in English translated to ${ctx.language}.
If a phrase sounds like it was translated from English, rephrase it using natural ${ctx.language} expressions.
${generalFormalityExamples}
${sharedLines}`
}

/**
 * Builds an angle differentiation instruction when the current theme
 * overlaps with previously covered topics. Forces a fresh creative angle.
 */
export function buildAngleDifferentiationSection(similarThemes: string[]): string {
  if (similarThemes.length === 0) return ''

  const themeList = similarThemes.map((t) => `- "${t}"`).join('\n')

  return `
ANGLE DIFFERENTIATION (critical — similar posts already exist):
The following past posts cover a similar topic:
${themeList}

You MUST take a completely different angle from ALL of the above:
- If past posts were informational → try emotional or storytelling
- If past posts focused on features → try a customer experience or behind-the-scenes angle
- If past posts were broad → go ultra-specific on one vivid detail
- If past posts were serious → try a lighter, conversational tone (within the brand voice)
- NEVER repeat the same hook style, structure, or CTA as the similar posts above
`
}

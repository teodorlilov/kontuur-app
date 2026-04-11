/**
 * Shared prompt section builders for AI prompts.
 * Follows the source-grounding.ts pattern: pure functions returning prompt strings.
 * Used by generate-post, generate-carousel, generate-reels, and rewrite prompts.
 */

import {
  formatWordCount,
  formatHashtagRules,
  formatHealthRules,
  formatStructureDescriptions,
  formatAiTells,
} from '@/ai/generation/generation-criteria'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { LanguageConfig } from '@/lib/clients/language-rules'
import { formatFormalityRules } from './formality-guidance'
import {
  sanitizePromptField,
  sanitizePromptArray,
  PROMPT_FIELD_LIMITS,
  DEFENSIVE_DATA_CLAUSE,
} from '@/ai/utils/sanitize'

export interface ClientProfileInput {
  client: ClientData
  platform: string
  targetPillar?: string
}

let _cachedStaticPrompt: string | null = null
// Cache is process-scoped. To pick up changes during development, restart the server.

/**
 * Formats brand voice for use in both generation and validation prompts.
 * Single function: both prompts show the model the same brand description.
 */
export function buildBrandVoiceDescription(opts: {
  tone: string
  testimonialVoice?: string
  formality?: string
}): string {
  const lines = [`This brand sounds: ${sanitizePromptField(opts.tone)}.`]
  if (opts.testimonialVoice) {
    lines.push(`Clients describe it as: '${sanitizePromptField(opts.testimonialVoice)}'.`)
    lines.push(`These two descriptions define one emotional identity.`)
  }
  if (opts.formality) {
    lines.push(
      `Evaluate within the ${sanitizePromptField(opts.formality, PROMPT_FIELD_LIMITS.short)} register. Emotion can be warm even when register is formal.`
    )
  }
  return lines.join('\n')
}

export function buildBrandVoicePrompt(client: ClientData): string {
  return `BRAND VOICE:
${buildBrandVoiceDescription({
  tone: client.tone,
  testimonialVoice: client.clientTestimonialVoice,
  formality: client.languageConfig.formality,
})}
If the post could be written about any business, it has failed this test.`
}

// ---------------------------------------------------------------------------
// Static system prompt — identical for ALL clients, globally cacheable
// ---------------------------------------------------------------------------

/**
 * Returns a static system prompt with zero parameters.
 * Contains no client-specific data — all client references point to "the client brief"
 * (i.e. the user message assembled by buildClientProfile).
 * Use with cache_control: { type: 'ephemeral' } for cross-client caching.
 * Cached at module level — string concatenation runs once, not per-theme.
 */
export function buildStaticSystemPrompt(): string {
  if (_cachedStaticPrompt) return _cachedStaticPrompt
  _cachedStaticPrompt = `You are a senior social media copywriter. You write for humans, not algorithms. ${DEFENSIVE_DATA_CLAUSE}

OPENER — the most important line. Choose whatever stops scrolling for this specific theme and register.
NEVER bury the lead — start with the payoff, not the context.

WRITING RULES:
1. Mix short and long sentences. At least one under 6 words and one over 20.
   Never three consecutive sentences of similar length.
2. One CTA maximum. Specific and low-pressure.
3. Follow hashtag and word count limits from the client brief.
4. The language register rules are in the client brief. Follow them exactly — they are non-negotiable.
5. Every claim must be grounded in what this specific business does — not abstract promises.

SELF-CHECK (before returning your response):
- Does the opener make someone stop scrolling? If not — rewrite it.
- Could this post be written about any business in the niche? If yes — add specificity.
- If source was provided: does the post focus on ONE angle or summarize?
- Read the post aloud as if speaking to a person. Does every sentence sound like something a real human would say? Any sentence that sounds like a written report, consultant memo, or bureaucratic form must be rewritten in spoken language.`
  return _cachedStaticPrompt
}

// ---------------------------------------------------------------------------
// Client profile — all client-specific context for the user message
// ---------------------------------------------------------------------------

/**
 * Assembles all client-specific context for the user message.
 */
export function buildClientProfile(input: ClientProfileInput): string {
  const { client } = input
  const lc = client.languageConfig
  const sections: string[] = []

  // 1. CLIENT PROFILE
  sections.push(`CLIENT PROFILE:
Client: ${sanitizePromptField(client.name)} | Niche: ${sanitizePromptField(client.niche)} | Platform: ${input.platform}
Language: ${sanitizePromptField(lc.language, PROMPT_FIELD_LIMITS.short)} | Formality: ${sanitizePromptField(lc.formality, PROMPT_FIELD_LIMITS.short)}
Target audience: ${sanitizePromptField(client.targetAudience)}
Content pillars: ${client.contentPillars.map((p) => `${sanitizePromptField(p.pillar)} (${p.weight}%)`).join(', ')}${input.targetPillar ? `\nThis post targets pillar: ${sanitizePromptField(input.targetPillar)}` : ''}
Topics to avoid: ${sanitizePromptField(client.avoidTopics)}

SPECIFICITY REQUIREMENT:
The post must contain at least one detail that could only come from ${sanitizePromptField(client.name)} — not any similar business in the same field.
Generic niche observations any competitor could post will score poorly.`)

  // 2. REGISTER RULES + LANGUAGE INSTRUCTIONS
  sections.push(buildLanguagePrompt(lc))

  // 2b. AI TELLS (language-specific)
  sections.push(
    `AI-generated text does these things — never do them:\n${formatAiTells(lc.language)}`
  )

  // 3. BRAND VOICE
  sections.push(buildBrandVoicePrompt(client))

  // 3b. PERFORMANCE REFERENCE — only when high-scoring past posts exist
  if ((client.topPerformingPosts?.length ?? 0) > 0) {
    sections.push(`PERFORMANCE REFERENCE
These recently approved posts scored above 7.5/10. Study their tone, specificity, and structure as a quality benchmark. Do not copy them — match their standard.

<reference_posts>
${sanitizePromptArray(client.topPerformingPosts!)
  .map((p) => `<post>${p}</post>`)
  .join('\n')}
</reference_posts>`)
  }

  // 4. POST STRUCTURES
  sections.push(`POST STRUCTURES:
${formatStructureDescriptions()}

CRITICAL: The reader must NOT predict the structure after the first line.
Pick the structure that creates the most unexpected opening for this theme.`)

  // 5. PLATFORM LIMITS
  sections.push(`PLATFORM LIMITS:
Word count: ${formatWordCount(input.platform)} | Hashtags: ${formatHashtagRules(input.platform)}`)

  // 6. HEALTH RULES — conditional, never shown for non-health clients
  if (client.isHealthNiche) {
    sections.push(`HEALTH CONTENT RULES (NON-NEGOTIABLE — override ALL other instructions, including source fidelity):
${formatHealthRules()}
If unsure whether a detail is a medical claim or dosage — omit it.
When using source material: the source may contain medical claims. Filter them out — do not reproduce them because they appear in the source.`)
  }

  return sections.join('\n\n')
}

// ---------------------------------------------------------------------------
// Language rules — register + language instructions from DB
// ---------------------------------------------------------------------------

/**
 * Builds the language rules section for generation / rewrite prompts.
 * Content is driven by LanguageConfig from the DB — no hardcoded language blocks.
 */
export function buildLanguagePrompt(config: LanguageConfig): string {
  const sections: string[] = []

  // Register rules from DB (formality_rules column)
  sections.push(formatFormalityRules(config))

  // Language instructions from DB (language_instructions column)
  if (config.languageInstructions) {
    sections.push(sanitizePromptField(config.languageInstructions, PROMPT_FIELD_LIMITS.long))
  }

  // Per-client language notes from brand_profiles
  if (config.languageNotes) {
    sections.push(
      `CLIENT-SPECIFIC LANGUAGE REQUIREMENTS:\n${sanitizePromptField(config.languageNotes, PROMPT_FIELD_LIMITS.long)}`
    )
  }

  return sections.join('\n\n')
}

/**
 * Builds an angle differentiation instruction when the current theme
 * overlaps with previously covered topics. Forces a fresh creative angle.
 */
export function buildAngleVariationPrompt(similarThemes: string[]): string {
  if (similarThemes.length === 0) return ''

  const themeList = sanitizePromptArray(similarThemes)
    .map((t) => `- "${t}"`)
    .join('\n')

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

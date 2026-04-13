import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { LanguageConfig } from '@/lib/clients/language-rules'
import { formatFormalityRules } from '@/ai/shared/formality-guidance'
import {
  formatAiTells,
  formatStructureDescriptions,
  formatWordCount,
  formatHashtagRules,
  formatHealthRules,
} from '@/ai/shared/content-criteria'
import {
  sanitizePromptField,
  sanitizePromptArray,
  PROMPT_FIELD_LIMITS,
} from '@/ai/utils/sanitize'

/**
 * CLIENT PROFILE header + brand voice.
 * Used by generation (build the post for this client) and validate-quality (check brand fit).
 */
export function buildClientProfileSection(
  client: ClientData,
  platform: string,
  targetPillar?: string
): string {
  const lc = client.languageConfig
  return `CLIENT PROFILE:
Client: ${sanitizePromptField(client.name)} | Niche: ${sanitizePromptField(client.niche)} | Platform: ${platform}
Language: ${sanitizePromptField(lc.language, PROMPT_FIELD_LIMITS.short)} | Formality: ${sanitizePromptField(lc.formality, PROMPT_FIELD_LIMITS.short)}
Target audience: ${sanitizePromptField(client.targetAudience)}
Content pillars: ${client.contentPillars.map((p) => `${sanitizePromptField(p.pillar)} (${p.weight}%)`).join(', ')}${targetPillar ? `\nThis post targets pillar: ${sanitizePromptField(targetPillar)}` : ''}
Topics to avoid: ${sanitizePromptField(client.avoidTopics)}

SPECIFICITY REQUIREMENT:
The post must contain at least one detail that could only come from ${sanitizePromptField(client.name)} — not any similar business in the same field.
Generic niche observations any competitor could post will score poorly.

BRAND VOICE:
This brand sounds: ${sanitizePromptField(client.tone)}.${
    client.tone
      ? `\nClients describe it as: '${sanitizePromptField(client.clientTestimonialVoice)}'.`
      : ''
  }`
}

/**
 * Language register rules — formality rules from DB JSON, language instructions, client notes.
 * Used by generation (follow these rules) and validate-language (check these rules).
 */
export function buildLanguageRulesSection(lc: LanguageConfig): string {
  return [
    formatFormalityRules(lc),
    lc.languageInstructions
      ? sanitizePromptField(lc.languageInstructions, PROMPT_FIELD_LIMITS.long)
      : '',
    lc.languageNotes
      ? `CLIENT-SPECIFIC LANGUAGE REQUIREMENTS:\n${sanitizePromptField(lc.languageNotes, PROMPT_FIELD_LIMITS.long)}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * AI tell patterns for the given language.
 * Used by generation (avoid these) and validate-quality (detect these).
 */
export function buildAiTellsSection(language: string): string {
  return `AI-generated text does these things — never do them:\n${formatAiTells(language)}`
}

/**
 * Post structure definitions.
 * Used by generation (declare + write using one of these) and validate-quality (check predictability).
 */
export function buildPostStructuresSection(): string {
  return `POST STRUCTURES:\n${formatStructureDescriptions()}\n\nCRITICAL: The reader must NOT predict the structure after the first line.\nPick the structure that creates the most unexpected opening for this theme.`
}

/**
 * Word count + hashtag limits for the platform.
 * Used by generation (follow limits) and validate-quality criteria checklist.
 */
export function buildPlatformLimitsSection(platform: string): string {
  return `PLATFORM LIMITS:\nWord count: ${formatWordCount(platform)} | Hashtags: ${formatHashtagRules(platform)}`
}

/**
 * Health content rules — only for isHealthNiche clients.
 * Used by generation and validate-quality (non-negotiable override).
 */
export function buildHealthRulesSection(): string {
  return `HEALTH CONTENT RULES (NON-NEGOTIABLE — override ALL other instructions, including source fidelity):
${formatHealthRules()}
If unsure whether a detail is a medical claim or dosage — omit it.
When using source material: the source may contain medical claims. Filter them out — do not reproduce them because they appear in the source.`
}

/**
 * Angle differentiation instruction — forces a fresh angle when similar past posts exist.
 * Used by generators when the current theme overlaps with previously covered topics.
 */
export function buildAngleVariationPrompt(similarThemes: string[]): string {
  if (similarThemes.length === 0) return ''

  const themeList = sanitizePromptArray(similarThemes)
    .map((t) => `- "${t}"`)
    .join('\n')

  return `ANGLE DIFFERENTIATION (critical — similar posts already exist):
The following past posts cover a similar topic:
${themeList}

You MUST take a completely different angle from ALL of the above:
- If past posts were informational → try emotional or storytelling
- If past posts focused on features → try a customer experience or behind-the-scenes angle
- If past posts were broad → go ultra-specific on one vivid detail
- If past posts were serious → try a lighter, conversational tone (within the brand voice)
- NEVER repeat the same hook style, structure, or CTA as the similar posts above`
}

/**
 * Convenience assembler for generation — calls all sections in the right order.
 * Validation imports the individual section builders above directly.
 */
export function buildClientSection(
  client: ClientData,
  platform: string,
  targetPillar?: string
): string {
  const lc = client.languageConfig
  const sections = [
    buildClientProfileSection(client, platform, targetPillar),
    buildLanguageRulesSection(lc),
    buildAiTellsSection(lc.language),
    buildPostStructuresSection(),
    buildPlatformLimitsSection(platform)
  ]

  if ((client.topPerformingPosts?.length ?? 0) > 0) {
    sections.push(
      `PERFORMANCE REFERENCE\nThese recently approved posts scored above 7.5/10. Study their tone, specificity, and structure as a quality benchmark. Do not copy them — match their standard.\n\n<reference_posts>\n${sanitizePromptArray(client.topPerformingPosts!).map((p) => `<post>${p}</post>`).join('\n')}\n</reference_posts>`
    )
  }
  if (client.isHealthNiche) {
    sections.push(buildHealthRulesSection())
  }

  return sections.join('\n\n')
}

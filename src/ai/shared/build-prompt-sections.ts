import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { LanguageConfig } from '@/lib/clients/language-rules'
import { formatFormalityRules } from '@/ai/shared/formality-guidance'
import {
  formatAiTells,
  formatWordCount,
  formatHealthRules,
} from '@/ai/shared/content-criteria'
import {
  sanitizePromptField,
  PROMPT_FIELD_LIMITS,
} from '@/ai/utils/sanitize'

/**
 * Lean client brief for generation prompts.
 */
export function buildClientBrief(
  client: ClientData,
  platform: string,
  targetPillar?: string
): string {
  const lines = [
    `BRIEF:`,
    `Niche: ${sanitizePromptField(client.niche)} | Audience: ${sanitizePromptField(client.targetAudience)} | Platform: ${platform}`,
    `Tone: ${sanitizePromptField(client.tone)}. Clients describe it as: "${sanitizePromptField(client.clientTestimonialVoice)}"`,
  ]
  if (targetPillar) lines.push(`This post targets pillar: ${sanitizePromptField(targetPillar)}`)
  if (client.avoidTopics) lines.push(`Topics to avoid: ${sanitizePromptField(client.avoidTopics)}`)
  return lines.join('\n')
}

/**
 * Detailed client profile for validation prompts.
 */
export function buildClientProfile(
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

BRAND VOICE:
This brand sounds: ${sanitizePromptField(client.tone)}.${
    client.tone
      ? `\nClients describe it as: '${sanitizePromptField(client.clientTestimonialVoice)}'.`
      : ''
  }`
}

/**
 * Language register rules for prompts.
 */
export function buildLanguageRules(lc: LanguageConfig): string {
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
 * AI tell patterns for validation and rewrite prompts.
 */
export function buildAiTells(language: string): string {
  return `AI-generated text does these things — never do them:\n${formatAiTells(language)}`
}

/**
 * Word count limits for the platform.
 */
export function buildPlatformLimits(platform: string): string {
  return `PLATFORM LIMITS:\nWord count: ${formatWordCount(platform)}`
}

/**
 * Health content rules for health-niche clients.
 */
export function buildHealthRules(): string {
  return `HEALTH CONTENT RULES (NON-NEGOTIABLE — override ALL other instructions, including source fidelity):
${formatHealthRules()}
If unsure whether a detail is a medical claim or dosage — omit it.
When using source material: the source may contain medical claims. Filter them out — do not reproduce them because they appear in the source.`
}

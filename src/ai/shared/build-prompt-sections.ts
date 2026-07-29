import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { LanguageConfig } from '@/lib/clients/language-rules'
import { formatFormalityRules } from '@/ai/shared/formality-guidance'
import {
  formatAiTells,
  formatWordCount,
  formatHealthRules,
} from '@/ai/shared/content-criteria'
import { ISSUE_TYPE_DEFINITIONS } from '@/ai/validation/criteria'
import {
  sanitizePromptField,
  PROMPT_FIELD_LIMITS,
} from '@/ai/utils/sanitize'

/**
 * Lean client brief for generation prompts.
 * Pillar intentionally absent: it varies per theme and would break the cached
 * system-prompt prefix — the user turn carries the pillar line instead.
 */
export function buildClientBrief(client: ClientData, platform: string): string {
  const lines = [
    `BRIEF:`,
    `Niche: ${sanitizePromptField(client.niche)} | Audience: ${sanitizePromptField(client.targetAudience)} | Platform: ${platform}`,
    `Tone: ${sanitizePromptField(client.tone)}. Clients describe it as: "${sanitizePromptField(client.clientTestimonialVoice)}"`,
  ]
  if (client.avoidTopics) lines.push(`Topics to avoid: ${sanitizePromptField(client.avoidTopics)}`)
  return lines.join('\n')
}

/**
 * Detailed client profile for validation prompts.
 * Pillar-invariant for the same cache-prefix reason as buildClientBrief.
 */
export function buildClientProfile(client: ClientData, platform: string): string {
  const lc = client.languageConfig
  return `CLIENT PROFILE:
Client: ${sanitizePromptField(client.name)} | Niche: ${sanitizePromptField(client.niche)} | Platform: ${platform}
Language: ${sanitizePromptField(lc.language, PROMPT_FIELD_LIMITS.short)} | Formality: ${sanitizePromptField(lc.formality, PROMPT_FIELD_LIMITS.short)}
Target audience: ${sanitizePromptField(client.targetAudience)}
Content pillars: ${client.contentPillars.map((p) => `${sanitizePromptField(p.pillar)} (${p.weight}%)`).join(', ')}
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
 * The quality bar posts are validated against — injected into BOTH the
 * generation and validation prompts so the generator writes to the same
 * standard the validator grades. Derived from ISSUE_TYPE_DEFINITIONS
 * (single source), so the two can never drift apart again.
 */
export function buildQualityBar(): string {
  const failureModes = Object.entries(ISSUE_TYPE_DEFINITIONS)
    .map(([type, desc]) => `- ${type.replaceAll('_', ' ')}: ${desc}`)
    .join('\n')

  return `QUALITY BAR — every post is automatically validated against this standard; write to pass it the first time:
- Hook (first line; carousels: cover headline): name a specific mechanism, result, number, or named entity from the source material — never a topic label, greeting, or generic opener.
- CTA: exactly one, with an action verb tied to a specific service, outcome, or destination. For carousels the actionable CTA lives in the LAST slide's BODY.
- Failure modes that get posts flagged:
${failureModes}`
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

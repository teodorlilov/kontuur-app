import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { LanguageConfig } from '@/lib/clients/language-rules'
import type { PostType } from '@/types/api'
import { formatFormalityRules } from '@/ai/shared/formality-guidance'
import {
  formatAiTells,
  formatWordCount,
  formatHealthRules,
} from '@/ai/shared/content-criteria'
import { ISSUE_TYPE_DEFINITIONS } from '@/ai/validation/criteria'
import { LANGUAGE_STANDARDS } from '@/ai/shared/language-standards'
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
    `Tone: ${sanitizePromptField(client.tone)}`,
  ]
  // Conditional so a client who never answered the question keeps a byte-identical prompt — the
  // cached prefix is only invalidated for the clients the line actually describes.
  if (client.socialGoals) lines.push(`Goal: ${sanitizePromptField(client.socialGoals)}`)
  if (client.avoidTopics) lines.push(`Topics to avoid: ${sanitizePromptField(client.avoidTopics)}`)
  return lines.join('\n')
}

/**
 * Detailed client profile for validation prompts.
 * Pillar-invariant for the same cache-prefix reason as buildClientBrief.
 */
export function buildClientProfile(client: ClientData, platform: string): string {
  const lc = client.languageConfig
  // Pre-computed rather than inlined so an unanswered goal contributes no line at all, keeping the
  // prompt byte-identical for every client who has not set one.
  const goalLine = client.socialGoals
    ? `\nPost goal: ${sanitizePromptField(client.socialGoals)}`
    : ''
  return `CLIENT PROFILE:
Client: ${sanitizePromptField(client.name)} | Niche: ${sanitizePromptField(client.niche)} | Platform: ${platform}
Language: ${sanitizePromptField(lc.language, PROMPT_FIELD_LIMITS.short)} | Formality: ${sanitizePromptField(lc.formality, PROMPT_FIELD_LIMITS.short)}
Target audience: ${sanitizePromptField(client.targetAudience)}${goalLine}
Content pillars: ${client.contentPillars.map((p) => `${sanitizePromptField(p.pillar)} (${p.weight}%)`).join(', ')}
Topics to avoid: ${sanitizePromptField(client.avoidTopics)}

BRAND VOICE:
This brand sounds: ${sanitizePromptField(client.tone)}.`
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
 * The quality bar posts are written and graded against — the generation prompt
 * carries it so the writer targets the same standard the validator applies.
 * Derived from ISSUE_TYPE_DEFINITIONS (single source), so the two can never
 * drift apart. Phrased per format: the old format-neutral wording put carousel
 * instructions in every single-post prompt, and the writer sometimes obeyed
 * them — emitting SLIDE-structured text as a single post's caption.
 */
export function buildQualityBar(format: PostType): string {
  const failureModes = Object.entries(ISSUE_TYPE_DEFINITIONS)
    .map(([type, desc]) => `- ${type.replaceAll('_', ' ')}: ${desc}`)
    .join('\n')

  const hookRule =
    format === 'carousel'
      ? '- Hook (cover headline): name a specific mechanism, result, number, or named entity from the source material — never a topic label, greeting, or generic opener.'
      : '- Hook (first line): name a specific mechanism, result, number, or named entity from the source material — never a topic label, greeting, or generic opener.'
  const ctaRule =
    format === 'carousel'
      ? "- CTA: exactly one, with an action verb tied to a specific service, outcome, or destination. The actionable CTA lives in the LAST slide's BODY."
      : '- CTA: exactly one, with an action verb tied to a specific service, outcome, or destination.'

  return `QUALITY BAR — every post is automatically validated against this standard; write to pass it the first time:
${hookRule}
${ctaRule}
- Failure modes that get posts flagged:
${failureModes}`
}

/**
 * Native-writing rules for generation — LANGUAGE_STANDARDS rendered as writing
 * imperatives, the same table the validation judge renders as checks, so the
 * writer is told everything it will be graded on. The writer routinely works
 * from English source material — web search and site extraction — so without
 * these the judge is the only line of defense against translated-English
 * phrasing, and it arrives after the text is written. Skipped for English
 * clients: the standards are about crossing FROM English, and grammar/register
 * are carried for English by the AI-tells and quality-bar sections.
 */
export function buildNativeWritingRules(lc: LanguageConfig): string {
  if (lc.language.trim().toLowerCase() === 'english') return ''
  const rules = LANGUAGE_STANDARDS.map((s) => `- ${s.write(lc.language)}`).join('\n')
  return `WRITE NATIVE ${lc.language.toUpperCase()} — the validator grades every one of these; write to pass the first time:
- The source material is often English. Re-express its ideas in natural ${lc.language}; a native reader must not be able to tell the post was written from English material.
${rules}`
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

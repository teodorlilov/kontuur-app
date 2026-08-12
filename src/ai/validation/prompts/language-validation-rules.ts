import type { LanguageConfig } from '@/lib/clients/language-rules'
import { formatFormalityRules } from '@/ai/shared/formality-guidance'
import { LANGUAGE_STANDARDS } from '@/ai/shared/language-standards'
import { sanitizePromptField, PROMPT_FIELD_LIMITS } from '@/ai/utils/sanitize'

/**
 * The judge's language section: LANGUAGE_STANDARDS rendered as checks — the same
 * table generation renders as writing rules, so the judge can never grade a
 * standard the writer was not told — plus the client's own rules, sanitized.
 */
export function buildLanguageValidationRules(config: LanguageConfig): string {
  const baseRules = `Check for:
${LANGUAGE_STANDARDS.map((s, i) => `${i + 1}. ${s.check}`).join('\n')}`

  // Formality rules from DB — same rules generation was told to follow
  const formalitySection = `\n\n${formatFormalityRules(config)}\nFlag any content that violates the register rules above.`

  // The writer is INSTRUCTED to work these into carousel covers — a proofreader
  // that "fixes" them fights the client's own configuration every run.
  const swipeCues = config.carouselSwipeCues
    ? `\n\nSANCTIONED PHRASES: the client configured these carousel swipe cues — never flag or rewrite them: ${sanitizePromptField(config.carouselSwipeCues, PROMPT_FIELD_LIMITS.short)}`
    : ''

  // Language-specific instructions from DB — client-entered text, sanitized like
  // every other user-provided prompt field.
  const languageSpecific = config.languageInstructions
    ? `\n\n${config.language}-SPECIFIC CHECKS:\n${sanitizePromptField(config.languageInstructions, PROMPT_FIELD_LIMITS.long)}`
    : ''

  // Per-client language notes
  const clientNotes = config.languageNotes
    ? `\n\nCLIENT-SPECIFIC LANGUAGE REQUIREMENTS:\n${sanitizePromptField(config.languageNotes, PROMPT_FIELD_LIMITS.long)}`
    : ''

  return `${baseRules}${formalitySection}${swipeCues}${languageSpecific}${clientNotes}`
}

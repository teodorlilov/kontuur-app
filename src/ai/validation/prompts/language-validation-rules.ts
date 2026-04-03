/**
 * Builds language-specific validation rules for the language validator.
 *
 * This is a VALIDATION concern — not a generation concern.
 * It lives here, not in prompt-sections.ts, because it builds instructions
 * for validate-language.ts, not for any generation prompt.
 *
 * Consumer: features/ai/prompts/validation/validate-language.ts
 */
import type { LanguageConfig } from '@/lib/clients/language-rules'
import { formatFormalityRules } from '@/ai/generation/prompts/formality-guidance'

export function buildLanguageValidationRules(config: LanguageConfig): string {
  const baseRules = `Check for:
1. ANGLICISMS — English words used in target language text
2. CALQUES — Phrases translated literally from English that sound unnatural
3. GRAMMAR — Wrong conjugations, gender agreement, case endings, punctuation, incorrect expressions
4. FORMALITY — Consistent formal or informal address, never mixed
5. REGISTER — Naturalness score 1-10
6. MIXED_SCRIPT — Characters from the wrong alphabet mixed into words (e.g., Latin 'a', 'e', 'i', 'o', 'c', 'p' used inside Cyrillic words, or vice versa). Check EVERY word character-by-character. This is critical — a word like "влiza" mixes Cyrillic "вл" with Latin "iza" and must be flagged.
7. VOCABULARY — Non-native words borrowed from related but different languages (e.g., Russian words used in Bulgarian text like "визит" instead of "посещение", or Czech words in Slovak). Flag words that a native speaker would not use naturally.`

  // Formality rules from DB — same rules generation was told to follow
  const formalitySection = `\n\n${formatFormalityRules(config)}\nFlag any content that violates the register rules above.`

  // Language-specific instructions from DB
  const languageSpecific = config.languageInstructions
    ? `\n\n${config.language}-SPECIFIC CHECKS:\n${config.languageInstructions}`
    : ''

  // Per-client language notes
  const clientNotes = config.languageNotes
    ? `\n\nCLIENT-SPECIFIC LANGUAGE REQUIREMENTS:\n${config.languageNotes}`
    : ''

  return `${baseRules}${formalitySection}${languageSpecific}${clientNotes}`
}

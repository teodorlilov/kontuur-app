/**
 * Formats formality rules and examples from DB-stored FormalityRulesData.
 * Shared by both generation and validation — generation uses "follow these rules",
 * validation uses "flag violations of these rules."
 */
import type { LanguageConfig, FormalityExample, NeutralFormalityExample } from '@/lib/clients/language-rules'

function isFormalityExample(e: FormalityExample | NeutralFormalityExample): e is FormalityExample {
  return 'bad' in e && 'good' in e
}

function formatExample(e: FormalityExample | NeutralFormalityExample): string {
  if (isFormalityExample(e)) {
    return `BAD: ${e.bad}\nGOOD: ${e.good}\nWHY: ${e.reason}`
  }
  return `TOO FORMAL: ${e.too_formal}\nTOO CASUAL: ${e.too_casual}\nGOOD NEUTRAL: ${e.good_neutral}\nWHY: ${e.reason}`
}

/**
 * Format formality rules + examples into a prompt text block.
 * Picks language-specific examples when available, falls back to 'general'.
 */
export function formatFormalityRules(config: LanguageConfig | null): string {
  if (!config) return 'LANGUAGE REGISTER: Use neutral register consistently.'

  const { formality, formalityRules, language } = config

  if (!formalityRules?.registers) {
    return `LANGUAGE REGISTER: Use ${formality} register consistently.`
  }

  const register = formalityRules.registers[formality] ?? formalityRules.registers['neutral']
  if (!register) {
    return `LANGUAGE REGISTER: Use ${formality} register consistently.`
  }

  const rulesBlock = register.rules
    .map((r: string, i: number) => `${i + 1}. ${r}`)
    .join('\n')

  const langKey = language.toLowerCase()
  const langExamples = register.examples[langKey] ?? register.examples['general'] ?? []

  const examplesBlock = langExamples.length > 0
    ? `\n\n${formality.toUpperCase()} REGISTER — EXAMPLES:\n${langExamples.map(formatExample).join('\n\n')}`
    : ''

  return `LANGUAGE REGISTER (${formality.toUpperCase()}):\n${rulesBlock}${examplesBlock}`
}

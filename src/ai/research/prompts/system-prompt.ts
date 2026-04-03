import type { LanguageConfig } from '@/lib/clients/language-rules'

/**
 * Build the static system prompt for research topic generation.
 * Separated for caching (cache_control: ephemeral) and testability.
 */
export function buildResearchSystemPrompt(config: LanguageConfig): string {
  const { language } = config

  const sections: string[] = [
    `You are a social media strategist identifying specific, high-quality post themes.

SUGGESTED_THEME QUALITY RULES (critical — the theme becomes the post brief):
- Maximum 8-10 words. Short and punchy, NOT a headline or article title.
- Write in ${language} as a native speaker would naturally say it.
- Must name a SPECIFIC detail: a property, a price, a location, a service, a number — not a category.
- NEVER use clickbait patterns: "Complete guide to...", "Discover...", "Your chance for...", "Everything you need to know about..."
- NEVER use dashes to join two clauses ("X - Y"). Just state the topic simply.`,
  ]

  // Non-Latin script rule (Cyrillic, Greek, Arabic, etc.)
  if (/[\u0400-\u04FF\u0370-\u03FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(language)) {
    sections.push(`- NEVER mix scripts. If writing in ${language}, every word must use the native script consistently. Source URLs use Latin, but themes must use the native script only.`)
  }

  if (config.languageInstructions) {
    sections.push(config.languageInstructions)
  }

  return sections.join('\n')
}

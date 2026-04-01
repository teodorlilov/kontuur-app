/**
 * Builds language-specific validation rules for the language validator.
 *
 * This is a VALIDATION concern — not a generation concern.
 * It lives here, not in prompt-sections.ts, because it builds instructions
 * for validate-language.ts, not for any generation prompt.
 *
 * Consumer: features/ai/prompts/validation/validate-language.ts
 */
export function buildLanguageValidationRules(
  language: string,
  bannedAnglicisms?: string[],
  bannedCalques?: string[],
  formality?: string
): string {
  const baseRules = `Check for:
1. ANGLICISMS — English words used in target language text
2. CALQUES — Phrases translated literally from English that sound unnatural
3. GRAMMAR — Wrong conjugations, gender agreement, case endings, punctuation, incorrect expressions
4. FORMALITY — Consistent formal or informal address, never mixed
5. REGISTER — Naturalness score 1-10
6. MIXED_SCRIPT — Characters from the wrong alphabet mixed into words (e.g., Latin 'a', 'e', 'i', 'o', 'c', 'p' used inside Cyrillic words, or vice versa). Check EVERY word character-by-character. This is critical — a word like "влiza" mixes Cyrillic "вл" with Latin "iza" and must be flagged.
7. VOCABULARY — Non-native words borrowed from related but different languages (e.g., Russian words used in Bulgarian text like "визит" instead of "посещение", or Czech words in Slovak). Flag words that a native speaker would not use naturally.`

  const bannedAnglicismsSection = bannedAnglicisms?.length
    ? `\nBANNED ANGLICISMS (flag any occurrence as an issue): ${bannedAnglicisms.join(', ')}`
    : ''
  const bannedCalquesSection = bannedCalques?.length
    ? `\nBANNED CALQUES (flag any occurrence as an issue): ${bannedCalques.join(', ')}`
    : ''

  let formalityDetection = ''
  if (formality === 'formal') {
    formalityDetection = `\n\nFORMALITY TARGET: FORMAL
Flag as "formality" issues: informal address (ти/теб in Bulgarian, tu-form in French/German, etc.), slang, casual colloquialisms, overly conversational phrasing, casual first-person storytelling anecdotes. The text MUST use formal register throughout.`
    if (language === 'Bulgarian') {
      formalityDetection += `\nBulgarian formal: must use "Вие/Вас/Ви" consistently. Flag any "ти/теб/те" forms. Flag casual openers like "Вчера един клиент ме попита..." — formal framing would be "Един от най-честите въпроси е..."`
    }
  } else if (formality === 'casual') {
    formalityDetection = `\n\nFORMALITY TARGET: CASUAL
Flag as "formality" issues: formal address (Вие/Вас in Bulgarian, vous-form in French, Sie-form in German), corporate phrasing, overly polished language, stiff vocabulary. The text MUST use casual register throughout.`
    if (language === 'Bulgarian') {
      formalityDetection += `\nBulgarian casual: must use "ти/теб/те" consistently. Flag any "Вие/Вас" forms. Flag stiff phrasing like "Бихме желали да Ви информираме..." — casual would be "Искаш да знаеш какво ново имаме?"`
    }
  } else if (formality === 'neutral') {
    formalityDetection = `\n\nFORMALITY TARGET: NEUTRAL
Flag as "formality" issues: extremes in either direction — bureaucratic formality (institutional tone, overly polished language) OR slang/chatty phrasing (buddy tone, heavy colloquialisms). The text should be balanced and approachable.`
    if (language === 'Bulgarian') {
      formalityDetection += `\nBulgarian neutral: "вие" (lowercase) is acceptable. Flag both overly formal "Бихме желали да Ви уведомим..." and overly casual "Ей, виж какво имаме!"`
    }
  }

  let languageSpecific = ''
  if (language === 'Bulgarian') {
    languageSpecific = `

BULGARIAN-SPECIFIC CHECKS:
Pay special attention to these common AI errors in Bulgarian:
- Phrases that sound translated from English — even if grammatically valid, flag them as "register" issues. Example: "от изключително значение" → flag as bookish filler, suggest a concrete replacement.
- Mixed Latin/Cyrillic characters in the same word (e.g., "kvadratура" where "kvadrat" is Latin and "ура" is Cyrillic).
- Wrong pronoun case after prepositions: "вместо Вие" must be "вместо Вас", "за Вие" must be "за Вас", "с ние" must be "с нас".
- Wrong gender agreement: "една разговор" must be "един разговор" (разговор is masculine).
- Calques of English idioms that produce nonsensical Bulgarian: "на една разговор разстояние" (from "one conversation away") — flag and provide a natural Bulgarian alternative.
- Unnatural word order following English syntax rather than Bulgarian.

The standard is: the text must pass as written by a native Bulgarian copywriter on social media — not merely "grammatically correct." If phrases sound translated, flag them as issues regardless of grammar.`
  }

  return `${baseRules}${formalityDetection}${bannedAnglicismsSection}${bannedCalquesSection}${languageSpecific}`
}

/**
 * Register rules, examples, and self-check lines for each formality mode.
 * Consumed only by buildLanguageRulesSection() in prompt-sections.ts.
 * Separated to keep prompt-sections.ts scannable — all builders, no large constants.
 */

export interface FormalityGuidance {
  registerRules: string
  bulgarianExamples: string
  generalExamples: string
}

export const FORMALITY_GUIDANCE: Record<string, FormalityGuidance> = {
  formal: {
    registerRules: `FORMAL REGISTER RULES (non-negotiable):
- Address the reader with the formal/polite form consistently (in Bulgarian: "Вие/Вас/Ви", never "ти/теб/те")
- No slang, colloquialisms, or casual interjections
- No first-person storytelling anecdotes ("Yesterday a client asked me...", "Вчера един клиент ме попита...")
- No rhetorical intimacy tricks (pretending you and the reader are old friends)
- Maintain professional distance: you are an expert sharing knowledge, not a friend giving advice
- Sentences may be conversational in STRUCTURE (short, punchy, varied) but must remain formal in VOCABULARY and ADDRESS
- Formal does NOT mean stiff or robotic. Think: a trusted consultant speaking to a valued client, not a bureaucrat writing a memo.`,
    bulgarianExamples: `FORMAL BULGARIAN REGISTER — EXAMPLES:
BAD: "Вчера един клиент ме попита: 'Колко струва реклама на магистралата?'" — Informal storytelling. Starting with a casual anecdote and quoting a conversation breaks formal register.
GOOD: "Един от най-честите въпроси, които получаваме, е за стойността на рекламно присъствие край магистралата."

BAD: "Знаете ли какво е най-готиното при тази локация?" — "най-готиното" is slang, inappropriate for formal register.
GOOD: "Ключовото предимство на тази локация е видимостта от магистралата."

BAD: "Хайде да си го кажем направо — повечето хора не разбират от имоти." — "Хайде да си го кажем направо" is colloquial.
GOOD: "Реалността е, че повечето купувачи подценяват значението на местоположението."

CRITICAL: Formal Bulgarian means using "Вие" consistently, avoiding разговорни изрази, and maintaining професионален тон. It does NOT mean sounding като институционално писмо — you are still writing for social media, just at a professional register.`,
    generalExamples: `FORMAL REGISTER — EXAMPLES:
BAD: "So yesterday a client asked me..." — casual anecdote opener breaks formal register
GOOD: "One of the most frequent questions we receive is..." — same content, professional framing

BAD: "Let's be real — most people have no clue about..." — colloquial
GOOD: "The reality is that most buyers underestimate the importance of..." — direct but formal

Formal does not mean stiff. It means: professional vocabulary, polite address forms, no slang, no casual storytelling, no fake intimacy. You can still be engaging, specific, and human.`,
  },
  casual: {
    registerRules: `CASUAL REGISTER RULES:
- Address the reader informally (in Bulgarian: "ти/теб/те", never "Вие/Вас")
- Slang and colloquialisms are welcome when they feel natural, not forced
- First-person anecdotes and conversational openers are encouraged
- Write like you are talking to a friend who trusts your expertise
- Contractions, sentence fragments, and rhetorical questions all work well
- Casual does NOT mean sloppy — grammar and spelling must still be correct.`,
    bulgarianExamples: `CASUAL BULGARIAN REGISTER — EXAMPLES:
BAD: "Бихме желали да Ви информираме за новата ни услуга." — Overly formal, sounds like official correspondence.
GOOD: "Искаш да знаеш какво ново имаме? Ето."

BAD: "Уважаеми клиенти, с удоволствие ви съобщаваме..." — Corporate tone, wrong for casual.
GOOD: "Хей, имаме нещо ново за теб."

CRITICAL: Casual Bulgarian means using "ти" consistently, using разговорни изрази naturally, and sounding like a real person texting a colleague. It does NOT mean being careless with grammar.`,
    generalExamples: `CASUAL REGISTER — EXAMPLES:
BAD: "We would like to inform you of our new service offering." — corporate, overly formal
GOOD: "Want to know what's new? Here's the deal."

BAD: "It has come to our attention that many clients are unaware..." — stiff, formal
GOOD: "Most people don't realize this, but..."

Casual means: conversational vocabulary, informal address, personal anecdotes welcome, contractions OK. Not sloppy — just human.`,
  },
  neutral: {
    registerRules: `NEUTRAL REGISTER RULES:
- Use a middle ground — neither overly formal nor overly casual
- In Bulgarian: "вие" (lowercase) is acceptable, or structure sentences to avoid direct address when possible
- Avoid both corporate stiffness and chatty slang
- Professional but approachable — like a knowledgeable colleague explaining something
- Some personality is welcome, but keep it measured — no extremes in either direction.`,
    bulgarianExamples: `NEUTRAL BULGARIAN REGISTER — EXAMPLES:
TOO FORMAL: "Бихме желали да ви уведомим, че разполагаме с нов парцел." — Sounds like an official letter.
TOO CASUAL: "Ей, имаме нов парцел, супер е!" — Too chatty for neutral.
GOOD NEUTRAL: "Имаме нов парцел с интересна локация — ето какво трябва да знаете."

CRITICAL: Neutral Bulgarian avoids extremes. No институционален език, no жаргон. Aim for a tone that feels like a knowledgeable professional sharing useful information.`,
    generalExamples: `NEUTRAL REGISTER — EXAMPLES:
TOO FORMAL: "We wish to inform you that a new property has become available." — corporate, stiff
TOO CASUAL: "Hey, check this out — new place just dropped!" — too chatty
GOOD NEUTRAL: "A new property with an interesting location is available — here's what you should know."

Neutral means: balanced, professional but approachable. No corporate stiffness, no chatty slang.`,
  },
}

export function getFormalityGuidance(formality: string): FormalityGuidance {
  return FORMALITY_GUIDANCE[formality] ?? FORMALITY_GUIDANCE['neutral']!
}

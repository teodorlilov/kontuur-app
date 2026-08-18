import type { LanguageIssueType } from '@/ai/validation/types'

/**
 * The language standards posts are written and judged against — one table,
 * rendered twice: the generation prompt shows each standard as a writing rule,
 * the validation prompt shows the same standard as a check (the same
 * single-source pattern as ISSUE_TYPE_DEFINITIONS / buildQualityBar). Before
 * this table the judge checked seven standards the writer had never been told,
 * so posts arrived pre-broken and everything hinged on post-hoc correction.
 *
 * `write` and `check` are two phrasings of ONE standard — edit them together.
 */
interface LanguageStandard {
  /** Judge-facing category — the `type` the judge reports in language_issues. */
  type: LanguageIssueType
  /** Imperative for the writer. */
  write: (language: string) => string
  /** Check description for the judge. */
  check: string
}

export const LANGUAGE_STANDARDS: LanguageStandard[] = [
  {
    type: 'anglicism',
    write: (l) =>
      `Use the established ${l} term for industry vocabulary — never drop an English word into ${l} text and never spell an English word phonetically in the ${l} alphabet (a transliterated English word is still English). Keep an English term ONLY when no established ${l} equivalent exists; brand and product names stay as-is.`,
    check:
      'ANGLICISMS — English words used in target language text where an established native term exists, INCLUDING English words spelled phonetically in the native alphabet (brand and product names are fine)',
  },
  {
    type: 'calque',
    write: (l) =>
      `Never translate English phrasing word-for-word — re-express the idea the way a native ${l} speaker would say it, in native word order.`,
    check:
      'CALQUES — Phrases translated literally from English that sound unnatural, including word order that follows English syntax',
  },
  {
    type: 'grammar',
    write: (l) =>
      `Flawless ${l} grammar: conjugations, gender agreement, case endings, punctuation.`,
    check:
      'GRAMMAR — Wrong conjugations, gender agreement, case endings, punctuation, incorrect expressions',
  },
  {
    type: 'formality',
    write: () =>
      'Hold the configured register from first line to CTA — never mix formal and informal address.',
    check: 'FORMALITY — Consistent formal or informal address, never mixed',
  },
  {
    type: 'register',
    write: (l) =>
      `Every sentence must read as a native ${l} speaker posting on social media — never as a translation.`,
    check: 'REGISTER — Naturalness score 1-10',
  },
  {
    type: 'mixed_script',
    write: () =>
      'Never mix alphabets inside a word — no Latin characters inside Cyrillic words or vice versa.',
    check: `MIXED_SCRIPT — Characters from the wrong alphabet mixed into words (e.g. Latin 'a', 'e', 'i', 'o', 'c', 'p' used inside Cyrillic words, or vice versa). Check EVERY word character-by-character. This is critical — a word like "влiza" mixes Cyrillic "вл" with Latin "iza" and must be flagged.`,
  },
  {
    type: 'vocabulary',
    write: (l) =>
      `Use words native to ${l} — never borrow from related languages a native speaker would not use.`,
    check: `VOCABULARY — Non-native words borrowed from related but different languages (e.g., Russian words used in Bulgarian text like "визит" instead of "посещение", or Czech words in Slovak). Flag words that a native speaker would not use naturally.`,
  },
]

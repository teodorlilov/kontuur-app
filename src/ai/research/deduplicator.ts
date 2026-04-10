import { NGRAM_SIZE } from '@/lib/content-rules/constants'

// ---------------------------------------------------------------------------
// Language config registry — add new languages here, no code changes needed
// ---------------------------------------------------------------------------

interface LanguageConfig {
  stopWords: Set<string>
  minWordLength: number
}

const EN_STOP_WORDS = new Set([
  'about', 'after', 'being', 'could', 'every', 'first', 'great', 'never',
  'other', 'right', 'shall', 'should', 'since', 'still', 'their', 'there',
  'these', 'those', 'through', 'under', 'using', 'where', 'which', 'while',
  'would', 'yours', 'based', 'doing', 'during', 'found', 'above', 'below',
  'between', 'wants',
])

const BG_STOP_WORDS = new Set([
  'и', 'на', 'за', 'от', 'по', 'се', 'да', 'не', 'е', 'в', 'с', 'ще',
  'като', 'тази', 'това', 'този', 'при', 'след', 'без', 'или', 'нас',
  'ние', 'вас', 'те', 'ти', 'ви', 'ни', 'си', 'му', 'ѝ', 'им', 'го',
  'ги', 'ме', 'ми', 'но', 'до', 'че', 'ако', 'още', 'къде', 'кога',
  'как', 'кой', 'коя', 'кое', 'кои', 'тя', 'той', 'то', 'ние',
])

const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  bulgarian: { stopWords: BG_STOP_WORDS, minWordLength: 3 },
  english: { stopWords: EN_STOP_WORDS, minWordLength: 5 },
}

const DEFAULT_CONFIG: LanguageConfig = { stopWords: EN_STOP_WORDS, minWordLength: 4 }

/**
 * Static utility for n-gram similarity scoring between research themes.
 * Used by the generation pipeline to detect near-duplicate angles.
 */
export class Deduplicator {
  /**
   * Compute n-gram similarity between two text strings.
   * Called as Deduplicator.ngramSimilarity(a, b, lang) — no instantiation needed.
   */
  static ngramSimilarity(a: string, b: string, language?: string): number {
    const config = Deduplicator.resolveConfig(language)
    const wordsA = Deduplicator.extractWords(a, config).join('')
    const wordsB = Deduplicator.extractWords(b, config).join('')
    if (wordsA.length === 0 || wordsB.length === 0) return 0
    return Deduplicator.jaccardSimilarity(
      Deduplicator.generateNgrams(wordsA),
      Deduplicator.generateNgrams(wordsB)
    )
  }

  private static resolveConfig(language?: string): LanguageConfig {
    if (!language) return DEFAULT_CONFIG
    return LANGUAGE_CONFIGS[language.toLowerCase()] ?? DEFAULT_CONFIG
  }

  private static extractWords(text: string, config: LanguageConfig): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= config.minWordLength && !config.stopWords.has(w))
  }

  private static generateNgrams(text: string, n: number = NGRAM_SIZE): Set<string> {
    const ngrams = new Set<string>()
    for (let i = 0; i <= text.length - n; i++) {
      ngrams.add(text.slice(i, i + n))
    }
    return ngrams
  }

  private static jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0
    let intersection = 0
    for (const item of a) {
      if (b.has(item)) intersection++
    }
    const union = a.size + b.size - intersection
    return union === 0 ? 0 : intersection / union
  }
}

import { NGRAM_SIZE, NGRAM_SIMILARITY_THRESHOLD, ENABLE_LLM_DEDUP } from '@/lib/content-rules/constants'
import { anthropic, DEFAULT_MODEL, DEFAULT_MAX_TOKENS } from '@/ai/client'
import { parseJsonResponse } from '@/ai/utils'

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

// ---------------------------------------------------------------------------
// LLM dedup response shape
// ---------------------------------------------------------------------------

interface DedupResult {
  duplicates: string[]
}

/**
 * Encapsulates both algorithmic (n-gram + word-overlap) and LLM-based
 * semantic deduplication of research themes against post history.
 */
export class Deduplicator {
  private static readonly MIN_MATCH_COUNT = 2
  private static readonly OVERLAP_THRESHOLD = 0.5

  private readonly config: LanguageConfig

  constructor(language?: string) {
    this.config = Deduplicator.resolveConfig(language)
  }

  // ---- Static public API (for external consumers like generate-posts.ts) ----

  /**
   * Compute n-gram similarity between two text strings.
   * Static so it can be called without instantiating: Deduplicator.ngramSimilarity(a, b, lang)
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

  // ---- Instance methods (used by the pipeline) ----

  /**
   * Check if a theme conflicts with any previously covered topic.
   * Uses two strategies (OR logic):
   * 1. Character n-gram similarity (handles morphological variants)
   * 2. Word-overlap matching (catches exact matches)
   */
  hasConflict(theme: string, history: string[]): boolean {
    const themeWords = Deduplicator.extractWords(theme, this.config)
    if (themeWords.length === 0) return false

    const themeNgramText = themeWords.join('')
    const themeNgrams = Deduplicator.generateNgrams(themeNgramText)

    return history.some((topic) => {
      // Strategy 1: n-gram similarity (catches morphological variants)
      const topicWords = Deduplicator.extractWords(topic, this.config)
      const topicNgramText = topicWords.join('')
      const topicNgrams = Deduplicator.generateNgrams(topicNgramText)
      if (Deduplicator.jaccardSimilarity(themeNgrams, topicNgrams) > NGRAM_SIMILARITY_THRESHOLD) {
        return true
      }

      // Strategy 2: word-overlap matching (original algorithm)
      const topicWordSet = new Set(topic.toLowerCase().split(/\s+/))
      const matchCount = themeWords.filter((w) => topicWordSet.has(w)).length
      return (
        matchCount >= Deduplicator.MIN_MATCH_COUNT ||
        (themeWords.length > 0 && matchCount / themeWords.length > Deduplicator.OVERLAP_THRESHOLD)
      )
    })
  }

  /** Filter topics, removing those that conflict with history. */
  filterConflicts<T extends { suggested_theme: string }>(topics: T[], history: string[]): T[] {
    return topics.filter((t) => !this.hasConflict(t.suggested_theme, history))
  }

  /**
   * Run LLM semantic dedup if enabled. Returns filtered topics.
   * Falls back to input topics on LLM error (logs warning).
   */
  async filterWithLLM<T extends { suggested_theme: string }>(
    topics: T[],
    history: string[],
    language: string
  ): Promise<T[]> {
    if (!ENABLE_LLM_DEDUP || topics.length === 0 || history.length === 0) return topics

    try {
      const candidates = topics.map((t) => t.suggested_theme)
      const duplicateIndices = await this.dedupThemesWithLLM(candidates, history, language)
      return topics.filter((_, i) => !duplicateIndices.has(i))
    } catch (err) {
      console.error('[research] LLM dedup failed, using algorithmic results only:', err)
      return topics
    }
  }

  // ---- Private static helpers ----

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

  // ---- Private instance methods ----

  private async dedupThemesWithLLM(
    candidates: string[],
    existing: string[],
    language: string
  ): Promise<Set<number>> {
    if (candidates.length === 0 || existing.length === 0) return new Set()

    const candidateList = candidates.map((c, i) => `${i}. ${c}`).join('\n')
    const existingList = existing.map((e, i) => `${i + 1}. ${e}`).join('\n')

    const prompt = `You are a deduplication filter for social media post themes in ${language}.

EXISTING themes (already used — do NOT repeat these):
${existingList}

CANDIDATE themes (new suggestions to check):
${candidateList}

Task: Identify which CANDIDATE themes are semantically the same topic as any EXISTING theme, even if worded differently, in different grammatical forms, or using synonyms.

Two themes are duplicates if a social media post written for one would cover essentially the same topic as a post written for the other.

Return JSON only:
{ "duplicates": ["0", "3"] }

The "duplicates" array should contain the index numbers (as strings) of CANDIDATE themes that duplicate an existing theme. Return an empty array if no duplicates found.`

    const message = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    })

    const result = parseJsonResponse<DedupResult>(message)
    const duplicateIndices = new Set<number>()

    for (const idx of result.duplicates) {
      const parsed = parseInt(idx, 10)
      if (!isNaN(parsed) && parsed >= 0 && parsed < candidates.length) {
        duplicateIndices.add(parsed)
      }
    }

    return duplicateIndices
  }
}

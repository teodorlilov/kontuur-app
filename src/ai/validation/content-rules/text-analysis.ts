import {
  MIN_SHORT_SENTENCE_WORDS,
  MIN_LONG_SENTENCE_WORDS,
  MAX_CONSECUTIVE_SIMILAR_LENGTH,
} from '@/ai/generation/generation-criteria'

export interface SentenceVarietyResult {
  hasShortSentence: boolean
  hasLongSentence: boolean
  maxConsecutiveSimilar: number
  passes: boolean
}

export function analyzeSentenceVariety(text: string): SentenceVarietyResult {
  // Split on sentence-ending punctuation
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (sentences.length === 0) {
    return {
      hasShortSentence: false,
      hasLongSentence: false,
      maxConsecutiveSimilar: 0,
      passes: false,
    }
  }

  const wordCounts = sentences.map((s) => s.split(/\s+/).filter((w) => w.length > 0).length)

  const hasShortSentence = wordCounts.some((n) => n < MIN_SHORT_SENTENCE_WORDS)
  const hasLongSentence = wordCounts.some((n) => n > MIN_LONG_SENTENCE_WORDS)

  // Find longest run of similar-length sentences (within 3 words of each other)
  let maxRun = 1
  let currentRun = 1
  for (let i = 1; i < wordCounts.length; i++) {
    const diff = Math.abs((wordCounts[i] ?? 0) - (wordCounts[i - 1] ?? 0))
    if (diff <= 3) {
      currentRun++
      maxRun = Math.max(maxRun, currentRun)
    } else {
      currentRun = 1
    }
  }

  return {
    hasShortSentence,
    hasLongSentence,
    maxConsecutiveSimilar: maxRun,
    passes: hasShortSentence && hasLongSentence && maxRun <= MAX_CONSECUTIVE_SIMILAR_LENGTH,
  }
}

export function countWords(text: string): number {
  if (!text.trim()) return 0
  return text.trim().split(/\s+/).length
}

export function countHashtags(text: string): number {
  const matches = text.match(/#[^\s#]+/g)
  return matches?.length ?? 0
}

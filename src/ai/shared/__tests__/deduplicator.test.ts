import { describe, it, expect } from 'vitest'
import { Deduplicator } from '../deduplicator'

/**
 * Covers the pair the generation pipeline actually calls — `buildCache` +
 * `findSimilar` (generation-orchestrator's `attachSimilarThemes`).
 *
 * This file previously tested only `Deduplicator.ngramSimilarity`, a public static
 * with zero production callers: the live path reaches the same trigram/Jaccard
 * machinery through the cache instead. That function and its tests were deleted
 * together — code kept alive only by its own test is still dead — and these
 * exercise the same algorithm through the API that ships.
 */

describe('Deduplicator.findSimilar', () => {
  it('matches a near-duplicate angle and ignores an unrelated one', () => {
    const cache = Deduplicator.buildCache(
      ['Post-workout recovery tips for runners', 'Choosing the right winter boots'],
      'English'
    )

    expect(Deduplicator.findSimilar('Recovery tips after a workout for runners', cache, 0.15)).toEqual([
      'Post-workout recovery tips for runners',
    ])
  })

  it('returns nothing when the query is all stop words or too short to score', () => {
    const cache = Deduplicator.buildCache(['Post-workout recovery tips'], 'English')

    expect(Deduplicator.findSimilar('the and of', cache, 0.15)).toEqual([])
    expect(Deduplicator.findSimilar('', cache, 0.15)).toEqual([])
  })

  it('skips corpus entries that carry no scoreable words', () => {
    // An entry whose words are all stop words yields an empty n-gram set. Left
    // unguarded, Jaccard over two empty sets is 0/0 — the filter must drop it
    // rather than let it match everything.
    const cache = Deduplicator.buildCache(['the and of', 'Recovery tips for runners'], 'English')

    expect(Deduplicator.findSimilar('recovery tips for runners', cache, 0.15)).toEqual([
      'Recovery tips for runners',
    ])
  })

  it('honours the threshold', () => {
    const cache = Deduplicator.buildCache(['Post-workout recovery tips for runners'], 'English')

    expect(Deduplicator.findSimilar('Post-workout recovery tips for runners', cache, 0.9)).toHaveLength(1)
    expect(Deduplicator.findSimilar('Choosing winter boots', cache, 0.9)).toHaveLength(0)
  })

  it('applies the Bulgarian stop-word list and its shorter word floor', () => {
    // Bulgarian keeps 3-letter words where English needs 5, so the same corpus
    // scores differently by language — the reason resolveConfig exists.
    const bg = Deduplicator.buildCache(['Възстановяване след тренировка'], 'Bulgarian')

    expect(Deduplicator.findSimilar('Възстановяване след тренировка', bg, 0.5)).toHaveLength(1)
  })

  it('falls back to the default config for an unknown language', () => {
    const cache = Deduplicator.buildCache(['Post-workout recovery tips'], 'Klingon')

    expect(Deduplicator.findSimilar('Post-workout recovery tips', cache, 0.5)).toHaveLength(1)
  })
})

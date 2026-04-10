import { describe, it, expect } from 'vitest'
import { Deduplicator } from '../deduplicator'

// ---------------------------------------------------------------------------
// Deduplicator.ngramSimilarity — unit tests for the trigram engine
// ---------------------------------------------------------------------------

describe('Deduplicator.ngramSimilarity', () => {
  it('returns high similarity for Bulgarian morphological variants', () => {
    const a = 'актуализация'
    const b = 'актуализирана'
    const score = Deduplicator.ngramSimilarity(a, b, 'Bulgarian')
    expect(score).toBeGreaterThan(0.3)
  })

  it('returns high similarity for the exact user-reported pair', () => {
    const a = 'База данни с ежедневна актуализация на имоти'
    const b = 'База данни актуализирана ежедневно от нас'
    const score = Deduplicator.ngramSimilarity(a, b, 'Bulgarian')
    expect(score).toBeGreaterThan(0.3)
  })

  it('returns low similarity for genuinely different Bulgarian themes', () => {
    const a = 'Кършияка vs Тракия — кой квартал за какъв бюджет'
    const b = 'База данни актуализирана ежедневно от нас'
    const score = Deduplicator.ngramSimilarity(a, b, 'Bulgarian')
    expect(score).toBeLessThan(0.2)
  })

  it('returns 0 for empty strings', () => {
    expect(Deduplicator.ngramSimilarity('', '', 'Bulgarian')).toBe(0)
    expect(Deduplicator.ngramSimilarity('test', '', 'English')).toBe(0)
    expect(Deduplicator.ngramSimilarity('', 'test', 'English')).toBe(0)
  })

  it('returns 1 for identical strings', () => {
    const score = Deduplicator.ngramSimilarity('hello world', 'hello world', 'English')
    expect(score).toBe(1)
  })

  it('works without a language parameter (uses default config)', () => {
    const score = Deduplicator.ngramSimilarity('hello world', 'hello world')
    expect(score).toBe(1)
  })

  it('handles English morphological variants', () => {
    const score = Deduplicator.ngramSimilarity('updating database daily', 'updated databases daily', 'English')
    expect(score).toBeGreaterThan(0.3)
  })
})

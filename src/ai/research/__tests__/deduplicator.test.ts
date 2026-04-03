import { describe, it, expect, vi } from 'vitest'

vi.mock('@/utils/ai-client')

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

// ---------------------------------------------------------------------------
// Deduplicator.hasConflict — Bulgarian language tests
// ---------------------------------------------------------------------------

describe('Deduplicator.hasConflict — Bulgarian', () => {
  const dedup = new Deduplicator('Bulgarian')

  it('detects the exact user-reported duplicate pair', () => {
    const theme = 'База данни с ежедневна актуализация на имоти'
    const history = ['База данни актуализирана ежедневно от нас']
    expect(dedup.hasConflict(theme, history)).toBe(true)
  })

  it('does not flag genuinely different Bulgarian themes', () => {
    const theme = 'Кършияка vs Тракия — кой квартал за какъв бюджет'
    const history = [
      'База данни актуализирана ежедневно от нас',
      'Тристаен апартамент на ул. Гладстон за 85000€',
    ]
    expect(dedup.hasConflict(theme, history)).toBe(false)
  })

  it('detects near-duplicate with different word forms', () => {
    const theme = 'Ежедневно обновяване на имотна база'
    const history = ['Обновявана имотна база всеки ден']
    expect(dedup.hasConflict(theme, history)).toBe(true)
  })

  it('does not flag when only stop words overlap', () => {
    const theme = 'Нови строителни проекти в Пловдив'
    const history = ['Ресторанти за вечеря в София']
    expect(dedup.hasConflict(theme, history)).toBe(false)
  })

  it('handles empty history', () => {
    expect(dedup.hasConflict('Нов проект', [])).toBe(false)
  })

  it('handles theme that becomes empty after stop word removal', () => {
    // All words are stop words or too short
    expect(dedup.hasConflict('и на за от', [])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Deduplicator.hasConflict — English language tests (regression)
// ---------------------------------------------------------------------------

describe('Deduplicator.hasConflict — English', () => {
  const dedup = new Deduplicator('English')

  it('detects conflict with 2+ matching words (original behavior)', () => {
    const theme = 'sustainable fashion brands growing fast'
    const history = ['sustainable fashion trends this season']
    expect(dedup.hasConflict(theme, history)).toBe(true)
  })

  it('does not flag unrelated themes', () => {
    const theme = 'sustainable fashion brands growing fast'
    const history = ['best pizza restaurants downtown']
    expect(dedup.hasConflict(theme, history)).toBe(false)
  })

  it('works with default language (backward compatibility)', () => {
    const defaultDedup = new Deduplicator()
    const theme = 'sustainable fashion brands growing fast'
    const history = ['sustainable fashion trends this season']
    expect(defaultDedup.hasConflict(theme, history)).toBe(true)
  })

  it('does not flag with only 1 overlapping word (below threshold)', () => {
    const theme = 'modern architecture downtown buildings'
    const history = ['vintage architecture restoration projects']
    // Only "architecture" overlaps — 1 out of 4 words = 25% < 50%
    // But n-gram may catch it if shared trigrams are high enough
    const result = dedup.hasConflict(theme, history)
    // This should be false — the themes are about different aspects of architecture
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Deduplicator.hasConflict — unknown language (fallback)
// ---------------------------------------------------------------------------

describe('Deduplicator.hasConflict — unknown language fallback', () => {
  it('uses default config for unknown language without crashing', () => {
    const dedup = new Deduplicator('Klingon')
    const theme = 'some random theme here'
    const history = ['some random theme here']
    expect(dedup.hasConflict(theme, history)).toBe(true)
  })

  it('uses default config when language is undefined', () => {
    const dedup = new Deduplicator()
    const theme = 'unique content creation strategy'
    const history = ['different marketing approach entirely']
    expect(dedup.hasConflict(theme, history)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('Deduplicator.hasConflict — edge cases', () => {
  it('handles single-word themes', () => {
    const dedup = new Deduplicator('English')
    expect(dedup.hasConflict('architecture', ['architecture trends'])).toBe(true)
  })

  it('handles themes with only punctuation after cleanup', () => {
    const dedup = new Deduplicator('English')
    expect(dedup.hasConflict('--- ???', ['hello world'])).toBe(false)
  })

  it('is case-insensitive', () => {
    const dedup = new Deduplicator('Bulgarian')
    const theme = 'БАЗА ДАННИ АКТУАЛИЗАЦИЯ'
    const history = ['база данни актуализация']
    expect(dedup.hasConflict(theme, history)).toBe(true)
  })
})

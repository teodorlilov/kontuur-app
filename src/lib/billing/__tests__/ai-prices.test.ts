import { describe, expect, it } from 'vitest'
import { anthropicCostCents, tavilyCostCents } from '../ai-prices'

const NO_TOKENS = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  webSearches: 0,
}

describe('the cost of a call', () => {
  it('keeps fractions of a cent rather than rounding each call, which would price a small Haiku call at nothing', () => {
    expect(
      anthropicCostCents('claude-haiku-4-5', { ...NO_TOKENS, inputTokens: 1_000 })
    ).toBeCloseTo(0.086, 10)
    expect(tavilyCostCents()).toBeCloseTo(0.688, 10)
  })
})

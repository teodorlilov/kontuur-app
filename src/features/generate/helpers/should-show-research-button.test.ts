import { describe, it, expect } from 'vitest'
import { shouldShowResearchButton } from './should-show-research-button'

describe('shouldShowResearchButton', () => {
  it('returns true when source_strategy is null (no profile loaded)', () => {
    expect(shouldShowResearchButton(null)).toBe(true)
  })

  it('returns true when source_strategy is undefined', () => {
    expect(shouldShowResearchButton(undefined)).toBe(true)
  })

  it('returns true when trend_fallback is true', () => {
    expect(
      shouldShowResearchButton({ rss: true, website: true, file: true, trend_fallback: true })
    ).toBe(true)
  })

  it('returns false when trend_fallback is false', () => {
    expect(
      shouldShowResearchButton({ rss: true, website: true, file: true, trend_fallback: false })
    ).toBe(false)
  })

  it('returns false when only trend_fallback is disabled (other sources on)', () => {
    expect(
      shouldShowResearchButton({ rss: true, website: false, file: false, trend_fallback: false })
    ).toBe(false)
  })

  it('returns true when trend_fallback is enabled but all other sources disabled', () => {
    expect(
      shouldShowResearchButton({ rss: false, website: false, file: false, trend_fallback: true })
    ).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { formatLanguage } from '../language-row'

describe('formatLanguage', () => {
  it('reads back with the same labels the pickers show', () => {
    // The draft stores 'formal'; the row says "Formal", exactly as the settings Select does.
    expect(formatLanguage({ language: 'Bulgarian', languageFormality: 'formal' })).toBe(
      'Bulgarian — Formal'
    )
    expect(formatLanguage({ language: 'English', languageFormality: 'casual' })).toBe(
      'English — Casual'
    )
  })

  it('is empty when no language was detected', () => {
    expect(formatLanguage({ language: '', languageFormality: 'neutral' })).toBe('')
  })

  it('falls back to the bare language when the formality is not one we offer', () => {
    expect(formatLanguage({ language: 'English', languageFormality: '' })).toBe('English')
    expect(formatLanguage({ language: 'English', languageFormality: 'stiff' })).toBe('English')
  })
})

import { describe, expect, it } from 'vitest'
import {
  CAPTION_MAX_CHARS,
  CAPTION_MAX_HASHTAGS,
  CAPTION_MAX_MENTIONS,
  altTextFromCaption,
  validateInstagramCaption,
} from '../validate-caption'

describe('validateInstagramCaption', () => {
  it('accepts an ordinary caption', () => {
    expect(validateInstagramCaption('Morning at the counter. #coffee @greenleaf')).toBeNull()
  })

  it('accepts exactly the limit and rejects one past it', () => {
    expect(validateInstagramCaption('а'.repeat(CAPTION_MAX_CHARS))).toBeNull()
    expect(validateInstagramCaption('а'.repeat(CAPTION_MAX_CHARS + 1))).toMatch(/2,200/)
  })

  it('counts code points, not UTF-16 units — emoji must not double-count', () => {
    // 1100 astral-plane emoji = 2200 UTF-16 units but only 1100 characters.
    expect(validateInstagramCaption('🌿'.repeat(1100))).toBeNull()
  })

  it('counts Cyrillic and Latin hashtags alike', () => {
    const ok = Array.from({ length: CAPTION_MAX_HASHTAGS }, (_, i) => `#тема${i}`).join(' ')
    expect(validateInstagramCaption(ok)).toBeNull()
    expect(validateInstagramCaption(`${ok} #onemore`)).toMatch(/hashtags/)
  })

  it('rejects too many mentions', () => {
    const mentions = Array.from({ length: CAPTION_MAX_MENTIONS + 1 }, (_, i) => `@user${i}`).join(
      ' '
    )
    expect(validateInstagramCaption(mentions)).toMatch(/mentions/)
  })
})

describe('altTextFromCaption', () => {
  it('takes the first line', () => {
    expect(altTextFromCaption('Iced bar menu, day one\n\nSeven drinks.')).toBe(
      'Iced bar menu, day one'
    )
  })

  it('returns undefined for an empty caption', () => {
    expect(altTextFromCaption('')).toBeUndefined()
    expect(altTextFromCaption('\n\n')).toBeUndefined()
  })

  it('truncates a long first line on a code-point boundary', () => {
    const alt = altTextFromCaption('🌿'.repeat(200))
    expect(alt).toBeDefined()
    expect([...alt!].length).toBe(125)
    expect(alt!.endsWith('…')).toBe(true)
  })
})

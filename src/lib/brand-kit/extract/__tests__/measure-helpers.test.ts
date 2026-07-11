import { describe, expect, it } from 'vitest'
import { parseCssColor, toHex } from '../color'
import { familyCategory } from '../font-detect'

describe('parseCssColor', () => {
  it('parses the rgb()/rgba() strings getComputedStyle returns', () => {
    expect(toHex(parseCssColor('rgb(37, 99, 235)')!)).toBe('#2563EB')
    expect(toHex(parseCssColor('rgba(26, 26, 26, 0.8)')!)).toBe('#1A1A1A')
    expect(toHex(parseCssColor('rgb(255 255 255 / 50%)')!)).toBe('#FFFFFF')
  })

  it('parses hex and rejects junk', () => {
    expect(toHex(parseCssColor('#fff')!)).toBe('#FFFFFF')
    expect(parseCssColor('transparent')).toBeNull()
    expect(parseCssColor('inherit')).toBeNull()
  })
})

describe('familyCategory', () => {
  it('classifies serif stacks (generic and named)', () => {
    expect(familyCategory('Georgia, "Times New Roman", serif')).toBe('serif')
    expect(familyCategory('Playfair Display, serif')).toBe('serif')
  })

  it('classifies sans and mono stacks, not confusing sans-serif for serif', () => {
    expect(familyCategory('Inter, -apple-system, sans-serif')).toBe('sans')
    expect(familyCategory('Helvetica, Arial, sans-serif')).toBe('sans')
    expect(familyCategory('"JetBrains Mono", monospace')).toBe('mono')
  })
})

import { describe, expect, it } from 'vitest'
import { FONT_LIBRARY, isBakedFamily, isLibraryFamily } from '../font-library'

describe('FONT_LIBRARY', () => {
  it('marks exactly the two default families as baked', () => {
    const baked = FONT_LIBRARY.filter((f) => f.baked).map((f) => f.family)
    expect(baked).toEqual(['Source Serif 4', 'Source Sans 3'])
  })

  it('isBakedFamily and isLibraryFamily reflect the registry', () => {
    expect(isBakedFamily('Source Sans 3')).toBe(true)
    expect(isBakedFamily('Montserrat')).toBe(false)
    expect(isLibraryFamily('Playfair Display')).toBe(true)
    expect(isLibraryFamily('Comic Sans')).toBe(false)
  })

  it('every family declares a Bulgarian support level', () => {
    for (const font of FONT_LIBRARY) {
      expect(['strong', 'verify']).toContain(font.bulgarian)
    }
  })
})

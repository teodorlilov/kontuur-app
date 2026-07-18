import { describe, expect, it } from 'vitest'
import { FONT_LIBRARY, isLibraryFamily } from '../font-library'

describe('FONT_LIBRARY', () => {
  it('isLibraryFamily reflects the registry', () => {
    expect(isLibraryFamily('Playfair Display')).toBe(true)
    expect(isLibraryFamily('Comic Sans')).toBe(false)
  })

  it('every family declares a Bulgarian support level', () => {
    for (const font of FONT_LIBRARY) {
      expect(['strong', 'verify']).toContain(font.bulgarian)
    }
  })
})

import { describe, expect, it } from 'vitest'
import type { FontEntry } from '../font-library'
import { editorFontsHref } from '../google-fonts'

const upright: FontEntry = { family: 'Oswald', category: 'display', cyrillic: true, weights: [400, 700], italic: false }
const italic: FontEntry = { family: 'Lora', category: 'serif', cyrillic: true, weights: [700, 400], italic: true }

describe('editorFontsHref', () => {
  it('returns null for an empty library', () => {
    expect(editorFontsHref([])).toBeNull()
  })

  it('uses the weight-only axis for upright families', () => {
    expect(editorFontsHref([upright])).toContain('family=Oswald:wght@400;700')
  })

  it('uses sorted ital,wght tuples (uprights first) for italic families', () => {
    // css2 rejects unsorted tuple lists with a 400 for the WHOLE stylesheet.
    expect(editorFontsHref([italic])).toContain('family=Lora:ital,wght@0,400;0,700;1,400;1,700')
  })
})

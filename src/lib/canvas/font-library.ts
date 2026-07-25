/**
 * The curated editor font menu. Two tiers: Cyrillic-safe families (content can be Bulgarian) and
 * Latin-only crowd-pleasers, filtered out by the picker when a layer's text contains Cyrillic.
 * This module is the single owner of family names, categories and weights — brand-style pairings
 * and the font picker both read from here.
 */

export type FontCategory = 'display' | 'serif' | 'sans' | 'script'

interface FontFaceSpec {
  category: FontCategory
  /** False = Google Fonts serves no Cyrillic subset; Bulgarian text would fall back to a system face. */
  cyrillic: boolean
  /** Weights actually hosted by Google Fonts for this family (many display faces are 400-only). */
  weights: readonly number[]
  /** True = Google hosts an italic face at every listed weight (never synthesize obliques). */
  italic: boolean
}

const FONT_FAMILIES = {
  // display
  Unbounded: { category: 'display', cyrillic: true, weights: [400, 700], italic: false },
  'Sofia Sans Condensed': { category: 'display', cyrillic: true, weights: [400, 700], italic: true },
  Oswald: { category: 'display', cyrillic: true, weights: [400, 500, 700], italic: false },
  'Russo One': { category: 'display', cyrillic: true, weights: [400], italic: false },
  'Bebas Neue': { category: 'display', cyrillic: false, weights: [400], italic: false },
  Anton: { category: 'display', cyrillic: false, weights: [400], italic: false },
  'Abril Fatface': { category: 'display', cyrillic: false, weights: [400], italic: false },
  // serif
  'Playfair Display': { category: 'serif', cyrillic: true, weights: [400, 500, 700], italic: true },
  Prata: { category: 'serif', cyrillic: true, weights: [400], italic: false },
  'Cormorant Garamond': { category: 'serif', cyrillic: true, weights: [400, 700], italic: true },
  Lora: { category: 'serif', cyrillic: true, weights: [400, 700], italic: true },
  // sans
  Manrope: { category: 'sans', cyrillic: true, weights: [400, 700], italic: false },
  Commissioner: { category: 'sans', cyrillic: true, weights: [400, 700], italic: false },
  'Source Sans 3': { category: 'sans', cyrillic: true, weights: [400, 700], italic: true },
  'Golos Text': { category: 'sans', cyrillic: true, weights: [400, 700], italic: false },
  Montserrat: { category: 'sans', cyrillic: true, weights: [400, 700], italic: true },
  Poppins: { category: 'sans', cyrillic: false, weights: [400, 700], italic: true },
  'Space Grotesk': { category: 'sans', cyrillic: false, weights: [400, 700], italic: false },
  // script
  Caveat: { category: 'script', cyrillic: true, weights: [400, 700], italic: false },
  'Marck Script': { category: 'script', cyrillic: true, weights: [400], italic: false },
} as const satisfies Record<string, FontFaceSpec>

export type FontFamilyName = keyof typeof FONT_FAMILIES

export interface FontEntry extends FontFaceSpec {
  family: FontFamilyName
}

export const FONT_LIBRARY: readonly FontEntry[] = (
  Object.keys(FONT_FAMILIES) as FontFamilyName[]
).map((family) => ({ family, ...FONT_FAMILIES[family] }))

const CYRILLIC_PATTERN = /[Ѐ-ӿ]/

/** True when the text contains any Cyrillic character (drives the Latin-only tier filter). */
export function hasCyrillic(text: string): boolean {
  return CYRILLIC_PATTERN.test(text)
}

/** The families the picker may offer — Latin-only entries are excluded when Cyrillic is required. */
export function availableFonts(requiresCyrillic: boolean): readonly FontEntry[] {
  if (!requiresCyrillic) return FONT_LIBRARY
  return FONT_LIBRARY.filter((entry) => entry.cyrillic)
}

/** Library entry for a doc's (free-string) family, or null when the doc references an unknown font. */
export function getFontEntry(family: string): FontEntry | null {
  return FONT_LIBRARY.find((entry) => entry.family === family) ?? null
}

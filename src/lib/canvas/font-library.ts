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
}

const FONT_FAMILIES = {
  // display
  Unbounded: { category: 'display', cyrillic: true, weights: [400, 700] },
  'Sofia Sans Condensed': { category: 'display', cyrillic: true, weights: [400, 700] },
  Oswald: { category: 'display', cyrillic: true, weights: [400, 500, 700] },
  'Russo One': { category: 'display', cyrillic: true, weights: [400] },
  'Bebas Neue': { category: 'display', cyrillic: false, weights: [400] },
  Anton: { category: 'display', cyrillic: false, weights: [400] },
  'Abril Fatface': { category: 'display', cyrillic: false, weights: [400] },
  // serif
  'Playfair Display': { category: 'serif', cyrillic: true, weights: [400, 500, 700] },
  Prata: { category: 'serif', cyrillic: true, weights: [400] },
  'Cormorant Garamond': { category: 'serif', cyrillic: true, weights: [400, 700] },
  Lora: { category: 'serif', cyrillic: true, weights: [400, 700] },
  // sans
  Manrope: { category: 'sans', cyrillic: true, weights: [400, 700] },
  Commissioner: { category: 'sans', cyrillic: true, weights: [400, 700] },
  'Source Sans 3': { category: 'sans', cyrillic: true, weights: [400, 700] },
  'Golos Text': { category: 'sans', cyrillic: true, weights: [400, 700] },
  Montserrat: { category: 'sans', cyrillic: true, weights: [400, 700] },
  Poppins: { category: 'sans', cyrillic: false, weights: [400, 700] },
  'Space Grotesk': { category: 'sans', cyrillic: false, weights: [400, 700] },
  // script
  Caveat: { category: 'script', cyrillic: true, weights: [400, 700] },
  'Marck Script': { category: 'script', cyrillic: true, weights: [400] },
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
